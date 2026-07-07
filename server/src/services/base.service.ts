import { Document } from 'mongoose';
import { PaginationParams, PaginatedResponse } from '../types/common';

export interface IBaseService<T extends Document> {
  findById(id: string, populate?: string[]): Promise<T | null>;
  findOne(
    conditions?: Record<string, any>,
    options?: Record<string, any>,
    populate?: string[]
  ): Promise<T | null>;
  find(
    conditions?: Record<string, any>,
    options?: Record<string, any>,
    populate?: string[]
  ): Promise<T[]>;
  paginate(
    conditions: Record<string, any>,
    pagination: PaginationParams,
    sort?: Record<string, 1 | -1>,
    populate?: string[]
  ): Promise<PaginatedResponse<T>>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  softDelete(id: string): Promise<boolean>;
  count(conditions?: Record<string, any>): Promise<number>;
  exists(conditions: Record<string, any>): Promise<boolean>;
}
