import type { RequestHandler } from "express";
import type {
  CreateBranchInput,
  ListBranchesQuery,
  UpdateBranchInput,
} from "./branches.schema";
import {
  createBranch,
  deactivateBranch,
  listBranches,
  updateBranch,
} from "./branches.service";

export const listBranchesController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListBranchesQuery;
  const result = await listBranches(query, request.user!);
  response.status(200).json({
    branches: result.branches,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const createBranchController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateBranchInput;
  const branch = await createBranch(input, request.user!.id, request.ip);
  response.status(201).json({ branch });
};

export const updateBranchController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateBranchInput;
  const branch = await updateBranch(id, input, request.user!.id, request.ip);
  response.status(200).json({ branch });
};

export const deactivateBranchController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const branch = await deactivateBranch(id, request.user!.id, request.ip);
  response.status(200).json({ branch });
};
