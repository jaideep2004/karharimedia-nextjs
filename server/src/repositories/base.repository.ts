import { Model, Document, FilterQuery, QueryOptions, UpdateQuery } from 'mongoose';
import { PaginationParams, PaginatedResponse } from '../types/common';

export abstract class BaseRepository<T extends Document> {
  constructor(protected model: Model<T>) {}

  async findById(id: string, populate: string[] = []): Promise<T | null> {
    let query = this.model.findById(id);
    
    // Apply population if specified
    populate.forEach(field => {
      query = query.populate(field);
    });
    
    return query.exec();
  }

  async findOne(
    conditions: FilterQuery<T> = {},
    options: QueryOptions = {},
    populate: string[] = []
  ): Promise<T | null> {
    let query = this.model.findOne(conditions, null, options);
    
    populate.forEach(field => {
      query = query.populate(field);
    });
    
    return query.exec();
  }

  async find(
    conditions: FilterQuery<T> = {},
    options: QueryOptions = {},
    populate: string[] = []
  ): Promise<T[]> {
    let query = this.model.find(conditions, null, options);
    
    populate.forEach(field => {
      query = query.populate(field);
    });
    
    return query.exec();
  }

  async paginate(
    conditions: FilterQuery<T> = {},
    pagination: PaginationParams = { page: 1, limit: 10 },
    sort: Record<string, 1 | -1> = { createdAt: -1 },
    populate: string[] = []
  ): Promise<PaginatedResponse<T>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;
    
    const [total, items] = await Promise.all([
      this.model.countDocuments(conditions).exec(),
      this.model
        .find(conditions)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate(populate.join(' '))
        .exec()
    ]);
    
    const totalPages = Math.ceil(total / limit);
    
    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages
      }
    };
  }

  async create(data: Partial<T>): Promise<T> {
    const document = new this.model(data);
    return document.save();
  }

  async update(
    id: string,
    data: UpdateQuery<T>,
    options: QueryOptions = { new: true }
  ): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, data, options).exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return !!result;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndUpdate(
      id,
      { 
        deletedAt: new Date(),
        isDeleted: true 
      },
      { new: true }
    ).exec();
    
    return !!result;
  }

  async count(conditions: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(conditions).exec();
  }

  async exists(conditions: FilterQuery<T>): Promise<boolean> {
    const count = await this.model.countDocuments(conditions).exec();
    return count > 0;
  }
}
