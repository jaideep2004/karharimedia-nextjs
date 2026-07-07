/**
 * Example interface matching the backend model
 */
export interface Example {
  _id: string;
  title: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new example
 */
export interface CreateExampleInput {
  title: string;
  description: string;
  isActive?: boolean;
}

/**
 * Input for updating an existing example
 */
export interface UpdateExampleInput {
  title?: string;
  description?: string;
  isActive?: boolean;
} 