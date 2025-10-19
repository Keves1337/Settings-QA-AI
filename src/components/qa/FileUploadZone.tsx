import { useCallback, useState } from "react";
import { Upload, FileCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  onFilesUploaded: (files: File[]) => void;
  isProcessing?: boolean;
}

export const FileUploadZone = ({ onFilesUploaded, isProcessing }: FileUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesUploaded(files);
      }
    },
    [onFilesUploaded]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesUploaded(files);
      }
    },
    [onFilesUploaded]
  );

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "relative border-2 border-dashed rounded-lg p-12 transition-all duration-200",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-muted-foreground/25 hover:border-primary/50",
        isProcessing && "pointer-events-none opacity-60"
      )}
    >
      <input
        type="file"
        multiple
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        accept=".js,.jsx,.ts,.tsx,.py,.java,.go,.rb,.php,.html,.css,.json,.md"
        disabled={isProcessing}
      />
      
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        {isProcessing ? (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Analyzing Your Project...</h3>
              <p className="text-sm text-muted-foreground">
                AI is generating comprehensive test cases from your code
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="relative">
              <Upload className="w-16 h-16 text-muted-foreground" />
              <FileCode className="w-8 h-8 text-primary absolute -bottom-1 -right-1" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">
                Drag & Drop Your Project Files
              </h3>
              <p className="text-sm text-muted-foreground">
                Or click to browse and select files
              </p>
              <p className="text-xs text-muted-foreground">
                Supports: JavaScript, TypeScript, Python, Java, Go, Ruby, PHP, HTML, CSS, JSON, Markdown
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
