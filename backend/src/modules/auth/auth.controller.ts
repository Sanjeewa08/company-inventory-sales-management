import type { RequestHandler } from "express";
import type { ChangePasswordInput, LoginInput } from "./auth.schema";
import { changePassword, login } from "./auth.service";

function requestIp(request: Parameters<RequestHandler>[0]): string | undefined {
  return request.ip;
}

export const loginController: RequestHandler = async (request, response) => {
  const input = response.locals.validated.body as LoginInput;
  response.status(200).json(await login(input, requestIp(request)));
};

export const meController: RequestHandler = (request, response) => {
  response.status(200).json({ user: request.user });
};

export const changePasswordController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as ChangePasswordInput;
  await changePassword(request.user!.id, input, requestIp(request));
  response.status(204).end();
};
