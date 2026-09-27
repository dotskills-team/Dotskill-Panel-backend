
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";
import { sendMail } from "../../utils/mailer";
import AppError from "../../errorHelpers/appError";
import { User } from "../user/user.model";
import { IProject } from "./project.interface";
import { Project } from "./project.model";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { projectSearchableFields } from "./project.constants";
import { Client } from "../clients/client.model";
import { Role } from "../user/user.interface";

const toObjectId = (id: string) => new Types.ObjectId(id);

const assertValidObjectId = (
  id: string,
  label = "ID",
) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid ${label}.`,
    );
  }
};

const assertUserExists = async (
  userId: string,
  label: string,
) => {
  assertValidObjectId(userId, label);

  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `${label} does not exist.`,
    );
  }

  return user;
};

const assertClientExists = async (
  clientId: string,
  label: string,
) => {
  assertValidObjectId(clientId, label);

  const client = await Client.findById(clientId);

  if (!client) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `${label} does not exist.`,
    );
  }

  return client;
};

const assertProjectExists = async (
  projectId: string,
  includeDeleted = false,
) => {
  assertValidObjectId(projectId, "Project ID");

  const filter: Record<string, any> = {
    _id: projectId,
  };

  if (!includeDeleted) {
    filter.isDeleted = false;
  }

  const project = await Project.findOne(filter);

  if (!project) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Project not found.",
    );
  }

  return project;
};

const populateOptions = [
  {
    path: "client",
    select: "firstName lastName email phone",
  },
  {
    path: "projectManager",
    select: "firstName lastName email",
  },
  {
    path: "developers",
    select: "firstName lastName email",
  },
  {
    path: "deletedBy",
    select: "firstName lastName email",
  },
];

const sanitizeQuery = (
  query: Record<string, string>,
) => {
  const sanitized = { ...query };

  delete sanitized["createdAt[gte]"];
  delete sanitized["createdAt[lte]"];

  return sanitized;
};

// Project document er kon field er upor date filter cholbe
const PROJECT_DATE_FIELD = "startDate";

// "2026-06-18" -> oi din er 00:00:00.000 theke 23:59:59.999 (UTC)
const getDayBoundariesUTC = (dateStr: string) => {
  const d = new Date(dateStr);

  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );

  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  return { start, end };
};

// Rules:
// - startDate + endDate  -> duita din er moddhe (inclusive range)
// - shudhu startDate     -> shudhu oi ek din
// - shudhu endDate       -> shudhu oi ek din
// - kono tai na          -> filter nai
const buildDateRangeFilter = (
  startDateStr?: string,
  endDateStr?: string,
): { $gte: Date; $lte: Date } | null => {
  if (startDateStr && endDateStr) {
    return {
      $gte: getDayBoundariesUTC(startDateStr).start,
      $lte: getDayBoundariesUTC(endDateStr).end,
    };
  }

  const single = startDateStr || endDateStr;

  if (single) {
    const { start, end } = getDayBoundariesUTC(single);
    return { $gte: start, $lte: end };
  }

  return null;
};

// Query theke startDate/endDate ber kore Mongo filter banay, ar query theke
// oi key gulo delete kore dey jate QueryBuilder eta ke normal field filter
// hishebe na dhore.
const buildDateFilter = (query: Record<string, string>) => {
  const startDateStr = query["startDate"];
  const endDateStr = query["endDate"];

  delete query.startDate;
  delete query.endDate;

  const range = buildDateRangeFilter(startDateStr, endDateStr);

  return range ? { [PROJECT_DATE_FIELD]: range } : {};
};


/**
 * Reorders priorities when a project's priority changes.
 *
 * - Create (oldPriority undefined): every project with priority >= newPriority
 *   shifts DOWN in rank (+1), making room at newPriority.
 * - Update, newPriority < oldPriority (moving to a higher priority / smaller
 *   number, e.g. 5 -> 1): projects in [newPriority, oldPriority - 1] shift
 *   DOWN in rank (+1).
 * - Update, newPriority > oldPriority (moving to a lower priority / larger
 *   number, e.g. 1 -> 5): projects in (oldPriority, newPriority] shift UP
 *   in rank (-1).
 */
const reorderPriority = async (
  newPriority: number,
  oldPriority?: number,
  excludeProjectId?: string,
) => {
  const excludeFilter = excludeProjectId
    ? { _id: { $ne: toObjectId(excludeProjectId) } }
    : {};

  // Create case: no oldPriority, just make room by pushing everything down.
  if (oldPriority === undefined) {
    const projectsToShift = await Project.find({
      priority: { $gte: newPriority },
      ...excludeFilter,
    })
      .sort({ priority: -1 })
      .select("_id priority");

    for (const proj of projectsToShift) {
      await Project.findByIdAndUpdate(proj._id, {
        priority: (proj.priority as number) + 1,
      });
    }
    return;
  }

  if (newPriority === oldPriority) return;

  if (newPriority < oldPriority) {
    // e.g. 5 -> 1: shift [1, 4] down by +1 (highest first, avoids unique collisions)
    const projectsToShift = await Project.find({
      priority: { $gte: newPriority, $lt: oldPriority },
      isDeleted: false,
      ...excludeFilter,
    })
      .sort({ priority: -1 })
      .select("_id priority");

    for (const proj of projectsToShift) {
      await Project.findByIdAndUpdate(proj._id, {
        priority: (proj.priority as number) + 1,
      });
    }
  } else {
    // e.g. 1 -> 5: shift (1, 5] up by -1 (lowest first, avoids unique collisions)
    const projectsToShift = await Project.find({
      priority: { $gt: oldPriority, $lte: newPriority },
      isDeleted: false,
      ...excludeFilter,
    })
      .sort({ priority: 1 })
      .select("_id priority");

    for (const proj of projectsToShift) {
      await Project.findByIdAndUpdate(proj._id, {
        priority: (proj.priority as number) - 1,
      });
    }
  }
};

/**
 * Create Project
 */
const createProject = async (
  payload: Partial<IProject>,
) => {

  console.log("Payload received in createProject:", payload); // Debugging line


  if (payload.client) {
    await assertClientExists(
      payload.client.toString(),
      "Client ID",
    );
  }

  if (payload.projectManager) {
    await assertUserExists(
      payload.projectManager.toString(),
      "Project manager ID",
    );
  }

  if (payload.developers?.length) {
    await Promise.all(
      payload.developers.map((developer) =>
        assertUserExists(
          developer.toString(),
          "Developer ID",
        ),
      ),
    );
  }

  if (payload.priority !== undefined) {
    await reorderPriority(payload.priority);
  }

  const project = await Project.create({
    ...payload,
    isDeleted: false,
    isActive: true,
  });

  const populatedProject =
    await Project.findById(project._id).populate(
      populateOptions,
    );

  return {
    data: populatedProject,
  };
};


const getStatusStats = async (filter: Record<string, unknown> = {}) => {
  const [agg] = await Project.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        status: { $ne: "CANCELLED" },
        ...filter,
      },
    },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        amounts: [
          {
            $project: {
              budget: { $ifNull: ["$budget", 0] },
              paid: {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: { $ifNull: ["$payments", []] },
                        as: "p",
                        cond: { $eq: ["$$p.status", "COMPLETE"] },
                      },
                    },
                    as: "p",
                    in: { $ifNull: ["$$p.amount", 0] },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              totalValue: { $sum: "$budget" },
              totalPaid: { $sum: "$paid" },
              totalDue: {
                $sum: {
                  $subtract: ["$budget", "$paid"],
                },
              },
            },
          },
        ],
      },
    },
  ]);

  const result = {
    total: 0,
    Planning: 0,
    InProgress: 0,
    OnHold: 0,
    Completed: 0,
    DoneDue: 0,
    Delivered: 0,
    totalValue: agg?.amounts?.[0]?.totalValue ?? 0,
    totalPaid: agg?.amounts?.[0]?.totalPaid ?? 0,
    totalDue: agg?.amounts?.[0]?.totalDue ?? 0,
  };

  (agg?.byStatus ?? []).forEach(
    (s: { _id: string; count: number }) => {
      switch (s._id) {
        case "PLANNING":
          result.Planning = s.count;
          break;

        case "IN_PROGRESS":
          result.InProgress = s.count;
          break;

        case "ON_HOLD":
          result.OnHold = s.count;
          break;

        case "COMPLETED":
          result.Completed = s.count;
          break;

        case "DONE_DUE":
          result.DoneDue = s.count;
          break;

        case "DELIVERED":
          result.Delivered = s.count;
          break;
      }

      result.total += s.count;
    }
  );

  return result;
};

/**
 * Get All Active Projects
 */
const getProjects = async (
  query: Record<string, string>,
) => {
  const cleanQuery = sanitizeQuery(query);
  const dateFilterObj = buildDateFilter(cleanQuery);

  // Default sort: startDate desc (Sept upore, June niche)
  if (!cleanQuery.sort) {
    cleanQuery.sort = "-startDate";
  }

  const baseFilter: Record<string, any> = {
    isDeleted: false,
    ...dateFilterObj,
  };

  const queryBuilder = new QueryBuilder(
    Project.find(baseFilter),
    cleanQuery,
  );

  const projectsQuery = queryBuilder
    .filter()
    .search(projectSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta, stats] = await Promise.all([
    projectsQuery
      .build()
      .populate(populateOptions),

    queryBuilder.getMeta(),
    getStatusStats(dateFilterObj),
  ]);

  return {
    data,
    meta,
    stats,
  };
};
/**
 * Get Deleted Projects
 */
const getDeletedProjects = async (
  query: Record<string, string>,
) => {
  const baseFilter: Record<string, any> = {
    isDeleted: true,
  };

  const queryBuilder = new QueryBuilder(
    Project.find(baseFilter),
    sanitizeQuery(query),
  );

  const projectsQuery = queryBuilder
    .filter()
    .search(projectSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta] = await Promise.all([
    projectsQuery
      .build()
      .populate(populateOptions),

    queryBuilder.getMeta(),
  ]);

  return {
    data,
    meta,
  };
};

/**
 * Get Project By ID
 */
const getProjectById = async (
  projectId: string,
) => {
  const project =
    await assertProjectExists(projectId);

  await project.populate(populateOptions);

  return {
    data: project,
  };
};

/**
 * Update Project
 */
const updateProject = async (
  projectId: string,
  payload: Partial<IProject>,
) => {
  await assertProjectExists(projectId);

  if (payload.client) {
    await assertClientExists(
      payload.client.toString(),
      "Client ID",
    );
  }

  if (payload.projectManager) {
    await assertUserExists(
      payload.projectManager.toString(),
      "Project manager ID",
    );
  }

  if (payload.developers?.length) {
    await Promise.all(
      payload.developers.map((developer) =>
        assertUserExists(
          developer.toString(),
          "Developer ID",
        ),
      ),
    );
  }

  if (payload.priority !== undefined) {
    const currentProject = await Project.findById(projectId).select("priority");
    if (currentProject?.priority !== payload.priority) {
      await reorderPriority(payload.priority, currentProject?.priority, projectId);
    }
  }

  const {
    isDeleted,
    deletedAt,
    deletedBy,
    ...safePayload
  } = payload;

  const updatedProject =
    await Project.findOneAndUpdate(
      {
        _id: projectId,
        isDeleted: false,
      },
      safePayload,
      {
        new: true,
        runValidators: true,
      },
    ).populate(populateOptions);

  if (!updatedProject) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Project not found.",
    );
  }

  return {
    data: updatedProject,
  };
};

/**
 * Soft Delete / Move To Trash
 */
const softDeleteProject = async (
  projectId: string,
  decodedToken: JwtPayload,
) => {
  await assertProjectExists(projectId);

  const updatedProject =
    await Project.findOneAndUpdate(
      {
        _id: projectId,
        isDeleted: false,
      },
      {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        deletedBy: toObjectId(decodedToken.userId),
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate(populateOptions);

  if (!updatedProject) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Project not found.",
    );
  }

  return {
    data: updatedProject,
  };
};

/**
 * Restore Project
 */
const restoreProject = async (
  projectId: string,
) => {
  assertValidObjectId(projectId, "Project ID");

  const project = await Project.findOne({
    _id: projectId,
    isDeleted: true,
  });

  if (!project) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Deleted project not found.",
    );
  }

  const updatedProject =
    await Project.findByIdAndUpdate(
      projectId,
      {
        isDeleted: false,
        isActive: true,
        deletedAt: null,
        deletedBy: null,
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate(populateOptions);

  return {
    data: updatedProject,
  };
};

/**
 * Generate + Send Invoice Email (PDF generated on frontend, sent here as base64)
 */
const sendProjectInvoice = async (
  projectId: string,
  pdfBase64: string,
) => {
  const project = await assertProjectExists(projectId);
  await project.populate([
    { path: "client", select: "firstName lastName email" },
  ]);

  const client = project.client as unknown as {
    firstName?: string;
    lastName?: string;
    email?: string;
  };

  if (!client?.email) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Client does not have an email address on file.",
    );
  }

  const pdfBuffer = Buffer.from(pdfBase64, "base64");

  await sendMail({
    to: client.email,
    subject: `Invoice for ${project.name}`,
    html: `
      <p>Dear ${client.firstName ?? "Client"},</p>
      <p>Please find attached the invoice for your project <strong>${project.name}</strong>.</p>
      <p>Thank you for your business.</p>
    `,
    attachments: [
      {
        filename: `Invoice-${project.name.replace(/\s+/g, "-")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  return { data: { sent: true } };
};

const permanentlyDeleteProject = async (
  projectId: string,
  decodedToken: JwtPayload,
) => {
  if (decodedToken.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only a Super Admin can permanently delete a project.",
    );
  }

  assertValidObjectId(projectId, "Project ID");

  const project = await Project.findOne({
    _id: projectId,
    isDeleted: true,
  });

  if (!project) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only already soft-deleted projects can be permanently deleted.",
    );
  }

  const deletedPriority = project.priority;

  await Project.findByIdAndDelete(projectId);

  // Close the gap left in the priority order: every remaining active
  // project ranked below the deleted one shifts UP by one.
  if (deletedPriority !== undefined) {
    const projectsToShift = await Project.find({
      priority: { $gt: deletedPriority },
      isDeleted: false,
    })
      .sort({ priority: 1 })
      .select("_id priority");

    for (const proj of projectsToShift) {
      await Project.findByIdAndUpdate(proj._id, {
        priority: (proj.priority as number) - 1,
      });
    }
  }

  return { data: null };
};


export const ProjectServices = {
  createProject,
  getProjects,
  getDeletedProjects,
  getProjectById,
  updateProject,
  softDeleteProject,
  restoreProject,
  sendProjectInvoice,
  permanentlyDeleteProject
};