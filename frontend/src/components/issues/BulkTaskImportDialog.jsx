import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import {
  downloadTaskImportSample,
  importTaskSpreadsheet,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const REQUIRED_FIELDS = [
  "Title",
  "Project",
  "Description",
  "Team",
  "Assignee",
  "Due Date",
];

const isExcelFile = (file) =>
  [".xlsx", ".xls"].some((extension) =>
    String(file?.name || "")
      .toLowerCase()
      .endsWith(extension)
  );

const BulkTaskImportDialog = ({ open, onOpenChange, onImported }) => {
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [validationError, setValidationError] = useState("");
  const [result, setResult] = useState(null);

  const failedRowsCsvHref = useMemo(() => {
    if (!result?.errorCsv) {
      return "";
    }

    return `data:text/csv;charset=utf-8,${encodeURIComponent(result.errorCsv)}`;
  }, [result]);

  const importMutation = useMutation({
    mutationFn: importTaskSpreadsheet,
    onSuccess: (data) => {
      setResult(data);
      setValidationError("");
      setFile(null);
      setInputKey((current) => current + 1);
      onImported?.(data);
    },
  });

  const downloadSampleMutation = useMutation({
    mutationFn: downloadTaskImportSample,
    onSuccess: ({ blob, fileName }) => {
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName || "task-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    },
  });

  const resetState = () => {
    setFile(null);
    setValidationError("");
    setResult(null);
    setInputKey((current) => current + 1);
  };

  const handleOpenChange = (nextOpen) => {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      resetState();
    }
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;

    setValidationError("");
    setResult(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isExcelFile(nextFile)) {
      setFile(null);
      setValidationError("Please choose an .xlsx or .xls file.");
      setInputKey((current) => current + 1);
      return;
    }

    setFile(nextFile);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setValidationError("");
    setResult(null);

    if (!file) {
      setValidationError("Please choose an Excel file before uploading.");
      return;
    }

    if (!isExcelFile(file)) {
      setFile(null);
      setValidationError("Please choose an .xlsx or .xls file.");
      setInputKey((current) => current + 1);
      return;
    }

    try {
      await importMutation.mutateAsync(file);
    } catch (error) {
      return error;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl border border-slate-200/80 bg-white p-0 shadow-[0_36px_90px_-50px_rgba(15,23,42,0.35)]">
        <div className="space-y-6 p-6 sm:p-7">
          <DialogHeader className="space-y-2 border-b border-slate-200/80 pb-5">
            <DialogTitle className="text-2xl tracking-tight text-slate-950">
              Bulk assign tasks from Excel
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-6 text-slate-600">
              Upload one Excel sheet to create admin task assignments in bulk. The
              sample includes live dropdowns for Project, Team, and Assignee, so keep
              the required columns exactly as shown before uploading.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {REQUIRED_FIELDS.map((field) => (
                <Badge
                  key={field}
                  variant="outline"
                  className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                >
                  {field}
                </Badge>
              ))}
            </div>

            <form className="space-y-4" onSubmit={handleUpload}>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                  Excel file
                </span>
                <Input
                  key={inputKey}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                />
              </label>

              {file ? (
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Selected file: <span className="font-semibold">{file.name}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={!file || importMutation.isPending}>
                  <Upload className="h-4 w-4" />
                  {importMutation.isPending ? "Importing..." : "Upload Excel"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={downloadSampleMutation.isPending}
                  onClick={() => downloadSampleMutation.mutate()}
                >
                  <Download className="h-4 w-4" />
                  {downloadSampleMutation.isPending
                    ? "Preparing sample..."
                    : "Download Sample Excel"}
                </Button>
              </div>
            </form>
          </div>

          {validationError ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
              {validationError}
            </div>
          ) : null}

          {downloadSampleMutation.isError ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
              {downloadSampleMutation.error?.response?.data?.message ||
                "Unable to download the sample right now."}
            </div>
          ) : null}

          {importMutation.isError ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
              {importMutation.error?.response?.data?.message ||
                "Unable to import tasks right now."}
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
                      <p className="text-sm font-semibold text-amber-900">Skipped rows</p>
                      <p className="mt-1 text-xs text-amber-800">
                        These rows were not imported. Fix them and upload again.
                      </p>
                    </div>

                    {failedRowsCsvHref ? (
                      <Button asChild size="sm" type="button" variant="outline">
                        <a href={failedRowsCsvHref} download="task-import-errors.csv">
                          <FileSpreadsheet className="h-4 w-4" />
                          Download Errors CSV
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="max-h-72 overflow-auto rounded-[20px] border border-amber-200 bg-white">
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
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {item.row}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{item.message}</td>
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
      </DialogContent>
    </Dialog>
  );
};

export default BulkTaskImportDialog;
