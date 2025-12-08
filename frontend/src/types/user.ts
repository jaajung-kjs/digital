import type { UserRole } from './auth';

export interface UserListItem {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ResetPasswordRequest {
  newPassword: string;
}
