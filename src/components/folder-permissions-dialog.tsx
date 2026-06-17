import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Shield, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  listFolderOverrides,
  listSubjectsForPermission,
  setFolderPermission,
  removeFolderPermission,
  type FolderPermLevel,
} from "@/lib/folder-permissions.functions";

interface SearchableSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  placeholder: string;
  emptyText: string;
  searchPlaceholder?: string;
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  searchPlaceholder,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex-1 justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? "搜索..."} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.label} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const TEACHER_LEVELS: Array<{ value: FolderPermLevel; label: string }> = [
  { value: "read", label: "只读" },
  { value: "download", label: "下载" },
  { value: "upload", label: "上传下载（默认）" },
  { value: "manage", label: "管理" },
];

const STUDENT_LEVELS: Array<{ value: FolderPermLevel; label: string }> = [
  { value: "none", label: "无访问（默认）" },
  { value: "read", label: "只读" },
  { value: "download", label: "下载" },
];

interface Override {
  id: string;
  subject_type: "teacher" | "student";
  subject_id: string;
  level: FolderPermLevel;
  display_name: string | null;
}

interface Props {
  folderId: string;
  folderName: string;
  trigger?: React.ReactNode;
}

export function FolderPermissionsDialog({ folderId, folderName, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; email: string | null }>>([]);
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  // forms
  const [newTeacherId, setNewTeacherId] = useState<string>("");
  const [newTeacherLevel, setNewTeacherLevel] = useState<FolderPermLevel>("read");
  const [newStudentId, setNewStudentId] = useState<string>("");
  const [newStudentLevel, setNewStudentLevel] = useState<FolderPermLevel>("read");

  const reload = async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([
        listFolderOverrides({ data: { folderId } }),
        listSubjectsForPermission(),
      ]);
      setOverrides(o.overrides);
      setTeachers(s.teachers);
      setStudents(s.students);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const teacherOverrides = useMemo(
    () => overrides.filter((o) => o.subject_type === "teacher"),
    [overrides],
  );
  const studentOverrides = useMemo(
    () => overrides.filter((o) => o.subject_type === "student"),
    [overrides],
  );

  const availableTeachers = useMemo(
    () => teachers.filter((t) => !teacherOverrides.some((o) => o.subject_id === t.id)),
    [teachers, teacherOverrides],
  );
  const availableStudents = useMemo(
    () => students.filter((s) => !studentOverrides.some((o) => o.subject_id === s.id)),
    [students, studentOverrides],
  );

  const handleAdd = async (subjectType: "teacher" | "student") => {
    const subjectId = subjectType === "teacher" ? newTeacherId : newStudentId;
    const level = subjectType === "teacher" ? newTeacherLevel : newStudentLevel;
    if (!subjectId) return;
    setBusy(true);
    try {
      await setFolderPermission({ data: { folderId, subjectType, subjectId, level } });
      if (subjectType === "teacher") setNewTeacherId("");
      else setNewStudentId("");
      await reload();
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (o: Override, level: FolderPermLevel) => {
    setBusy(true);
    try {
      await setFolderPermission({
        data: { folderId, subjectType: o.subject_type, subjectId: o.subject_id, level },
      });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    try {
      await removeFolderPermission({ data: { id } });
      await reload();
      toast.success("已恢复为默认权限");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" title="权限设置">
            <Shield className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>「{folderName}」 · 权限设置</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          未单独设置的对象沿用父文件夹权限；未授权时回落到默认（管理员=管理，老师=上传下载，学生=无访问）。
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中...
          </div>
        ) : (
          <Tabs defaultValue="student" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="student">家长 / 学生账号</TabsTrigger>
              <TabsTrigger value="teacher">教师账号</TabsTrigger>
            </TabsList>

            <TabsContent value="student" className="space-y-3">
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {studentOverrides.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    暂无单独授权
                  </div>
                ) : (
                  studentOverrides.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 rounded-md border p-2">
                      <div className="flex-1 truncate text-sm">{o.display_name ?? o.subject_id}</div>
                      <Select
                        value={o.level}
                        onValueChange={(v) => handleUpdate(o, v as FolderPermLevel)}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STUDENT_LEVELS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>
                              {l.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(o.id)}
                        disabled={busy}
                        title="删除（恢复默认）"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 border-t pt-3">
                <SearchableSelect
                  value={newStudentId}
                  onChange={setNewStudentId}
                  options={availableStudents.map((s) => ({ id: s.id, label: s.name }))}
                  placeholder="选择学生..."
                  emptyText="未找到匹配学生"
                  searchPlaceholder="搜索学生姓名..."
                />
                <Select
                  value={newStudentLevel}
                  onValueChange={(v) => setNewStudentLevel(v as FolderPermLevel)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleAdd("student")}
                  disabled={busy || !newStudentId}
                  size="sm"
                >
                  添加
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="teacher" className="space-y-3">
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {teacherOverrides.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    暂无单独授权（默认上传下载）
                  </div>
                ) : (
                  teacherOverrides.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 rounded-md border p-2">
                      <div className="flex-1 truncate text-sm">{o.display_name ?? o.subject_id}</div>
                      <Select
                        value={o.level}
                        onValueChange={(v) => handleUpdate(o, v as FolderPermLevel)}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEACHER_LEVELS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>
                              {l.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(o.id)}
                        disabled={busy}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 border-t pt-3">
                <SearchableSelect
                  value={newTeacherId}
                  onChange={setNewTeacherId}
                  options={availableTeachers.map((t) => ({ id: t.id, label: t.email ?? t.id }))}
                  placeholder="选择教师..."
                  emptyText="未找到匹配教师"
                  searchPlaceholder="搜索教师邮箱..."
                />
                <Select
                  value={newTeacherLevel}
                  onValueChange={(v) => setNewTeacherLevel(v as FolderPermLevel)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEACHER_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleAdd("teacher")}
                  disabled={busy || !newTeacherId}
                  size="sm"
                >
                  添加
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
