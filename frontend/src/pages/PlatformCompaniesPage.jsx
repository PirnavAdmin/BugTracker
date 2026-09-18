import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  createPlatformCompany,
  fetchPlatformCompanies,
  fetchPlatformPlans,
} from "@/lib/api";
import PlatformShell from "@/components/platform/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const companyStatuses = ["Active", "Suspended"];
const defaultForm = {
  name: "",
  email: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  planId: "starter",
  status: "Active",
};

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value))
    : "N/A";

const getStatusVariant = (status = "") => (status === "Active" ? "success" : "warning");

const PlatformCompaniesPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [planId, setPlanId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");
  const params = useMemo(
    () => ({
      page,
      limit: 10,
      search: search.trim(),
      status,
      planId,
    }),
    [page, planId, search, status]
  );

  const plansQuery = useQuery({
    queryKey: ["platform-plans"],
    queryFn: fetchPlatformPlans,
  });
  const companiesQuery = useQuery({
    queryKey: ["platform-companies", params],
    queryFn: () => fetchPlatformCompanies(params),
  });
  const createMutation = useMutation({
    mutationFn: createPlatformCompany,
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-dashboard-summary"] });
      setForm(defaultForm);
      setShowForm(false);
      setError("");
      navigate(`/platform/companies/${company._id}`);
    },
    onError: (mutationError) => {
      setError(mutationError?.response?.data?.message || "Unable to create company");
    },
  });

  const plans = plansQuery.data || [];
  const companies = companiesQuery.data?.companies || [];
  const pagination = companiesQuery.data?.pagination || { page: 1, pages: 1, total: 0 };

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitCompany = (event) => {
    event.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <PlatformShell
      title="Companies"
      actions={
        <Button className="h-10 rounded-lg" type="button" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Add Company
        </Button>
      }
    >
      <div className="space-y-4 p-4 xl:p-5">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-9 rounded-lg pl-9"
                placeholder="Search companies"
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
              >
                <option value="">All statuses</option>
                {companyStatuses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                value={planId}
                onChange={(event) => {
                  setPage(1);
                  setPlanId(event.target.value);
                }}
              >
                <option value="">All plans</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {companiesQuery.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-[360px] rounded-lg" />
            </div>
          ) : companies.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Tenant ID</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Users</th>
                    <th className="px-4 py-3">Projects</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Admin/User</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company._id} className="border-b border-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{company.name}</p>
                        <p className="text-xs text-slate-500">{company.email}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                        {company.tenantId || "N/A"}
                      </td>
                      <td className="px-4 py-3">{company.plan?.name || "N/A"}</td>
                      <td className="px-4 py-3">
                        {company.usage?.users
                          ? `${company.usage.users.current} / ${company.usage.users.unlimited ? "Unlimited" : company.usage.users.limit}`
                          : "N/A"}
                      </td>
                      <td className="px-4 py-3">
                        {company.usage?.projects
                          ? `${company.usage.projects.current} / ${company.usage.projects.unlimited ? "Unlimited" : company.usage.projects.limit}`
                          : "N/A"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="px-2 py-0.5" variant={getStatusVariant(company.status)}>
                          {company.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {company.adminUser ? (
                          <div>
                            <p className="font-semibold text-slate-900">{company.adminUser.name}</p>
                            <p className="text-xs text-slate-500">{company.adminUser.email}</p>
                          </div>
                        ) : (
                          "Not linked"
                        )}
                      </td>
                      <td className="px-4 py-3">{company.subscription?.status || "N/A"}</td>
                      <td className="px-4 py-3">{formatDate(company.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          className="h-9 rounded-lg"
                          type="button"
                          variant="outline"
                          onClick={() => navigate(`/platform/companies/${company._id}`)}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-[240px] place-items-center px-4 py-8 text-center text-sm font-medium text-slate-500">
              No companies available yet
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {pagination.page} of {pagination.pages} · {pagination.total} companies
            </span>
            <div className="flex gap-2">
              <Button
                className="h-9 rounded-lg"
                disabled={page <= 1}
                type="button"
                variant="outline"
                onClick={() => setPage((value) => Math.max(value - 1, 1))}
              >
                Previous
              </Button>
              <Button
                className="h-9 rounded-lg"
                disabled={page >= pagination.pages}
                type="button"
                variant="outline"
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </section>

        {showForm ? (
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-2 sm:p-4">
            <form className="my-auto w-full max-w-2xl max-h-[calc(var(--app-viewport-height)-1rem)] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:max-h-[calc(var(--app-viewport-height)-2rem)] sm:p-5" onSubmit={submitCompany}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-normal">Add Company</h2>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" type="button" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {error ? (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm font-semibold">
                  <span>Company Name</span>
                  <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} required />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Company Email</span>
                  <Input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} required />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Contact Person</span>
                  <Input value={form.contactPerson} onChange={(event) => updateForm("contactPerson", event.target.value)} />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Contact Email</span>
                  <Input type="email" value={form.contactEmail} onChange={(event) => updateForm("contactEmail", event.target.value)} />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Contact Phone</span>
                  <Input value={form.contactPhone} onChange={(event) => updateForm("contactPhone", event.target.value)} />
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Plan</span>
                  <select className="h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 text-sm" value={form.planId} onChange={(event) => updateForm("planId", event.target.value)}>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>Status</span>
                  <select className="h-11 w-full rounded-2xl border border-gray-300 bg-white px-4 text-sm" value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
                    {companyStatuses.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button className="rounded-lg" type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button className="rounded-lg" disabled={createMutation.isPending} type="submit">
                  {createMutation.isPending ? "Saving..." : "Create Company"}
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </PlatformShell>
  );
};

export default PlatformCompaniesPage;
