export enum UserRole {
  ARTIST = 'artist',
  LABEL = 'label',
  ADMIN = 'admin',
  SUBADMIN = 'subadmin'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  adminPreset?: string;
  permissions?: string[];
  supportCategories?: string[];
  artistName?: string;
  bio?: string;
  profilePicture?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
} 
