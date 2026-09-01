import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileUp, Upload } from "lucide-react";
import { importUsers } from "@/lib/api";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const sampleCsvContent = ["Full Name,Email Address", "Jane Doe,jane@example.com"].join(
  "\n"
);

const isCsvFile = (file) =>
  String(file?.name || "")
    .toLowerCase()
    .endsWith(".csv");

const ImportUsers = ({ embedded = false, onImported }) => {
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [validationError, setValidationError] = useState("");
  const [result, setResult] = useState(null);

  const sampleCsvHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsvContent)}`,
    []
  );
  const failedRowsCsvHref = useMemo(() => {
    if (!result?.errors?.length) {
      return "";
    }

    const csvContent = [
      "Row,Message",
      ...result.errors.map((item) => `${item.row},"${String(item.message).replace(/"/g, '""')}"`),
    ].join("\n");

    return `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
  }, [result]);

  const importMutation = useMutation({
    mutationFn: importUsers,
    onSuccess: (data) => {
      setResult(data);
      setValidationError("");
      setFile(null);
      setInputKey((current) => current + 1);
      onImported?.(data);
    },
  });

  const handleFileChange = (event) => {
    const nextFile = event.target.files[0] || null;

    setValidationError("");
    setResult(null);

    if (import.meta.env.DEV) {
      console.log("Selected file:", nextFile);
    }

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isCsvFile(nextFile)) {
      setFile(null);
      setValidationError("Please select a .csv file.");
      setInputKey((current) => current + 1);
      return;
    }

    setFile(nextFile);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setValidationError("");
    setResult(null);

    const selectedFile = file;

    if (import.meta.env.DEV) {
      console.log("Selected file:", selectedFile);
    }

    if (!selectedFile) {
      setValidationError("Please choose a .csv file before uploading.");
      return;
    }

    if (!isCsvFile(selectedFile)) {
      setFile(null);
      setValidationError("Please select a .csv file.");
      setInputKey((current) => current + 1);
      return;
    }

    try {
      await importMutation.mutateAsync(selectedFile);
    } catch (error) {
      return error;
    }
  };

  const content = (
    <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Full Name / name</Badge>
          <Badge variant="outline">Email Address / email</Badge>
        </div>

        <form className="space-y-4" onSubmit={handleUpload}>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
              CSV file
            </span>
            <Input
              key={inputKey}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </label>

          {file ? (
            <div className="rounded-[20px] border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Selected file: <span className="font-semibold">{file.name}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!file || importMutation.isPending}>
              <Upload className="h-4 w-4" />
              {importMutation.isPending ? "Importing..." : "Upload CSV"}
            </Button>

            <Button asChild type="button" variant="outline">
              <a href={sampleCsvHref} download="user-import-template.csv">
                <FileUp className="h-4 w-4" />
                Download Sample CSV
              </a>
            </Button>
          </div>
        </form>

        {validationError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
            {validationError}
          </div>
        ) : null}

        {importMutation.isError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
            {importMutation.error?.response?.data?.message ||
              "Unable to import users right now."}
            {importMutation.error?.response?.data?.code === "PLAN_LIMIT_REACHED" ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-violet-800">
                <span>
                  {importMutation.error.response.data.current} / {importMutation.error.response.data.limit} users used; {importMutation.error.response.data.rejected || importMutation.error.response.data.requested || 0} rejected.
                </span>
                <Link className="font-bold underline" to="/pricing">View Plans</Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800">
              <p className="font-semibold">{result.message || "Import completed"}</p>
              <p className="mt-2">Success count: {result.successCount || 0}</p>
              <p className="mt-1">Failed count: {result.failedCount || 0}</p>
            </div>

            {result.errors?.length ? (
              <div className="space-y-3 rounded-[24px] border border-amber-200 bg-amber-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Import issues</p>
                    <p className="mt-1 text-xs text-amber-800">
                      These rows were skipped during import.
                    </p>
                  </div>

                  {failedRowsCsvHref ? (
                    <Button asChild size="sm" type="button" variant="outline">
                      <a href={failedRowsCsvHref} download="user-import-errors.csv">
                        <FileUp className="h-4 w-4" />
                        Download Errors CSV
                      </a>
                    </Button>
                  ) : null}
                </div>

                <div className="overflow-x-auto rounded-[20px] border border-amber-200 bg-white">
                  <table className="min-w-full divide-y divide-amber-100 text-sm">
                    <thead className="bg-amber-50/90 text-left text-xs uppercase tracking-[0.18em] text-amber-800">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Row</th>
                        <th className="px-4 py-3 font-semibold">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {result.errors.map((item, index) => (
                        <tr key={`${item.row}-${item.message}-${index}`}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {item.row}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import users from CSV</CardTitle>
        <CardDescription>
          Upload a CSV with either `Full Name` or `name`, and `Email Address` or
          `email`. Comma, semicolon, and tab-delimited files are supported.
          Imported users get the default password `Curecode@123` and the default
          role `Developer`.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};

export default ImportUsers;
