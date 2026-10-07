import { useRef, useState } from "react";
import { UploadCloud, X, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ACCEPT, MAX_BYTES } from "@/lib/upload";
import { fmtBytes } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PendingFile {
  file: File;
  progress: number;
}

export function FileDropzone({
  files,
  onChange,
  disabled,
}: {
  files: PendingFile[];
  onChange: (f: PendingFile[]) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    const ok: PendingFile[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} excede 50 MB`);
        continue;
      }
      ok.push({ file: f, progress: 0 });
    }
    onChange([...files, ...ok]);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors",
          over && "border-accent bg-accent/10",
        )}
      >
        <UploadCloud className="h-8 w-8 text-accent" />
        <span className="text-sm font-medium">Arraste os arquivos ou toque para selecionar</span>
        <span className="text-xs text-muted-foreground">PDF, DWG, JPG, PNG, XLSX · até 50 MB cada</span>
      </button>
      <input ref={ref} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((pf, i) => (
            <li key={i} className="rounded-md border bg-card p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pf.file.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtBytes(pf.file.size)}</p>
                </div>
                {!disabled && (
                  <button type="button" aria-label="Remover" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-1 hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {pf.progress > 0 && <Progress value={pf.progress} className="mt-2 h-1.5" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
