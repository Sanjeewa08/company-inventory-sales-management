import type { RequestHandler } from "express";
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from "./users.schema";
import {
  createUser,
  deactivateUser,
  listUsers,
  updateUser,
} from "./users.service";

function getIp(request: Parameters<RequestHandler>[0]): string | undefined {
  return request.ip;
}

export const createUserController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateUserInput;
  const user = await createUser(input, request.user!.id, getIp(request));
  response.status(201).json({ user });
};

export const listUsersController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as ListUsersQuery;
  const result = await listUsers(query);
  response.status(200).json({
    users: result.users,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    },
  });
};

export const updateUserController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateUserInput;
  const user = await updateUser(id, input, request.user!.id, getIp(request));
  response.status(200).json({ user });
};

export const deactivateUserController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const user = await deactivateUser(id, request.user!.id, getIp(request));
  response.status(200).json({ user });
};
