import { Query, Types } from "mongoose";
import { excludeField } from "../../constants";

export class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public readonly query: Record<string, string>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, string>) {
    this.modelQuery = modelQuery;
    this.query = query;
  }

  filter(): this {
    const filter = { ...this.query };

    for (const field of excludeField) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete filter[field];
    }
    
    this.modelQuery = this.modelQuery.find(filter); 
    return this;
  }


  search(searchableField: string[]): this {
    const searchTerm = this.query.searchTerm || "";

    if (!searchTerm.trim()) {
      return this;
    }

    const searchConditions: any[] = [];

    // number search (customOrderId)
    if (!isNaN(Number(searchTerm))) {
      searchConditions.push({
        customOrderId: Number(searchTerm),
      });
    }

    // ObjectId search
    if (Types.ObjectId.isValid(searchTerm)) {
      searchConditions.push({
        _id: new Types.ObjectId(searchTerm),
      });
    }

    searchableField.forEach((field) => {
      searchConditions.push({
        [field]: { $regex: searchTerm, $options: "i" },
      });
    });

    this.modelQuery = this.modelQuery.find({
      $or: searchConditions,
    });

    return this;
  }

  sort(): this {
    const sort = this.query.sort || "-createdAt";
    this.modelQuery = this.modelQuery.sort(sort);
    return this;
  }

  fields(): this {
    const fields = this.query.fields?.split(",").join(" ") || "";
    this.modelQuery = this.modelQuery.select(fields);
    return this;
  }

  paginate(): this {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const skip = (page - 1) * limit;
    this.modelQuery = this.modelQuery.skip(skip).limit(limit);
    return this;
  }

  build() {
    return this.modelQuery;
  }

  async getMeta(baseFilter?: Record<string, any>) {
    // Use provided filter if available, otherwise take current query's filter
    const filter = baseFilter || this.modelQuery.getFilter();
    const totalDocuments = await this.modelQuery.model.countDocuments(filter);
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const totalPage = Math.ceil(totalDocuments / limit);

    return {
      page: page,
      limit: limit,
      total: totalDocuments,
      totalPage: totalPage,
    };
  }
}
