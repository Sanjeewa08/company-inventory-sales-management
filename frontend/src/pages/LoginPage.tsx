import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { useAuth } from "../features/auth/useAuth";
import {
  loginSchema,
  type LoginFormValues,
} from "../features/auth/authSchema";
import { getApiErrorMessage } from "../lib/api";

export function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (status === "loading") {
    return <Loading fullScreen label="Preparing your workspace" />;
  }
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await login(values);
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to sign in."));
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#101832]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-indigo-500/20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 right-0 size-[520px] rounded-full bg-cyan-400/10 blur-[130px]"
      />

      <div className="relative mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between px-12 py-10 text-white lg:flex xl:px-20">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-cyan-300 font-black text-[#101832]">
              MI
            </div>
            <div>
              <p className="font-bold tracking-tight">Meridian</p>
              <p className="text-xs text-slate-400">Inventory &amp; sales</p>
            </div>
          </div>

          <div className="max-w-xl pb-16">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-indigo-200">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              One clear view of your operations
            </div>
            <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight xl:text-6xl">
              Keep every branch moving.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
              A connected workspace for inventory, purchasing, and sales teams
              to stay aligned across every location.
            </p>

            <div className="mt-11 grid max-w-lg grid-cols-3 gap-3">
              {[
                ["01", "Inventory"],
                ["02", "Purchasing"],
                ["03", "Sales"],
              ].map(([number, label]) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  key={number}
                >
                  <p className="text-xs font-semibold tracking-widest text-indigo-300">
                    {number}
                  </p>
                  <p className="mt-3 text-sm font-medium text-slate-200">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Secure access for your company team
          </p>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:bg-white">
          <div className="w-full max-w-[440px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-cyan-300 font-black text-[#101832]">
                MI
              </div>
              <div className="text-white">
                <p className="font-bold">Meridian</p>
                <p className="text-xs text-slate-400">Inventory &amp; sales</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white p-7 shadow-2xl shadow-black/20 sm:p-10 lg:border-slate-100 lg:shadow-xl lg:shadow-slate-200/50">
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
                  Welcome back
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                  Sign in to Meridian
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Use your company account to continue to your workspace.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                <Input
                  autoComplete="username"
                  error={errors.email?.message}
                  label="Work email"
                  placeholder="name@company.com"
                  type="email"
                  {...register("email")}
                />
                <Input
                  autoComplete="current-password"
                  error={errors.password?.message}
                  label="Password"
                  placeholder="Enter your password"
                  type="password"
                  {...register("password")}
                />

                {formError && (
                  <p
                    className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
                    role="alert"
                  >
                    {formError}
                  </p>
                )}

                <Button
                  className="mt-1 w-full py-3"
                  loading={isSubmitting}
                  type="submit"
                >
                  Sign in
                  <span aria-hidden="true">→</span>
                </Button>
              </form>

              <div className="mt-7 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-100" />
                <span>Protected company workspace</span>
                <span className="h-px flex-1 bg-slate-100" />
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-slate-400 lg:text-slate-500">
              Need access? Contact your system administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
