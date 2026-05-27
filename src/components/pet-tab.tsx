import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Trophy, Swords, Utensils, Sparkles } from "lucide-react";
import {
  EGG_IMG,
  PET_LIST,
  PET_NAME,
  petImage,
  petFilter,
  xpForNext,
  HATCH_XP,
  FOOD_INFO,
  foodTierForScore,
  pickRandomSpecies,
  type FoodTier,
  type PetSpecies,
} from "@/lib/pet-data";
import {
  CHALLENGE_MODULES,
  generateChallenge,
  checkAnswer,
  checkFraction,
  type ChallengeModule,
  type Question,
} from "@/lib/pet-challenge";

const DAILY_LIMIT = 10;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Pet {
  id: string;
  species: PetSpecies | null;
  level: number;
  xp: number;
  hatched: boolean;
  challenges_today: number;
  challenges_date: string | null;
}

interface FoodRow {
  tier: FoodTier;
  quantity: number;
}

interface Props {
  studentId: string;
  editable: boolean; // 是否本人，可操作
}

export function PetTab({ studentId, editable }: Props) {
  const [pet, setPet] = useState<Pet | null>(null);
  const [foods, setFoods] = useState<Record<FoodTier, number>>({
    normal: 0,
    quality: 0,
    elixir: 0,
  });
  const [loading, setLoading] = useState(true);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [hatchAnim, setHatchAnim] = useState<PetSpecies | null>(null);

  const load = async () => {
    const { data: petRow } = await supabase
      .from("pets")
      .select("id, species, level, xp, hatched, challenges_today, challenges_date")
      .eq("student_id", studentId)
      .maybeSingle();
    let current: Pet | null = null;
    if (petRow) {
      current = petRow as Pet;
    } else if (editable) {
      const { data: inserted, error } = await supabase
        .from("pets")
        .insert({ student_id: studentId })
        .select("id, species, level, xp, hatched, challenges_today, challenges_date")
        .single();
      if (!error && inserted) current = inserted as Pet;
    }
    // 每日重置
    if (current && editable && current.challenges_date !== todayStr()) {
      await supabase
        .from("pets")
        .update({ challenges_today: 0, challenges_date: todayStr() })
        .eq("id", current.id);
      current = { ...current, challenges_today: 0, challenges_date: todayStr() };
    }
    setPet(current);
    const { data: foodRows } = await supabase
      .from("pet_foods")
      .select("tier, quantity")
      .eq("student_id", studentId);
    const map: Record<FoodTier, number> = { normal: 0, quality: 0, elixir: 0 };
    (foodRows as FoodRow[] | null)?.forEach((r) => {
      map[r.tier] = r.quantity;
    });
    setFoods(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const addFoods = async (tier: FoodTier, count: number) => {
    if (count <= 0) return;
    const current = foods[tier];
    const next = current + count;
    const { error } = await supabase
      .from("pet_foods")
      .upsert(
        { student_id: studentId, tier, quantity: next },
        { onConflict: "student_id,tier" },
      );
    if (error) {
      toast.error("食物保存失败");
      return;
    }
    setFoods((p) => ({ ...p, [tier]: next }));
  };

  const consumeChallengeQuota = async () => {
    if (!pet) return;
    const next = Math.min(DAILY_LIMIT, pet.challenges_today + 1);
    await supabase
      .from("pets")
      .update({ challenges_today: next, challenges_date: todayStr() })
      .eq("id", pet.id);
    setPet((p) => (p ? { ...p, challenges_today: next, challenges_date: todayStr() } : p));
  };

  const consumeFood = async (tier: FoodTier) => {
    if (!pet || !editable) return;
    if (foods[tier] <= 0) return;
    const xpGain = FOOD_INFO[tier].xp;
    let { level, xp, hatched, species } = pet;
    xp += xpGain;

    if (!hatched) {
      if (xp >= HATCH_XP) {
        // 孵化！
        species = pickRandomSpecies();
        hatched = true;
        level = 1;
        xp = xp - HATCH_XP;
        setHatchAnim(species);
        setTimeout(() => setHatchAnim(null), 3500);
      }
    } else {
      // 升级判断（可能连升）
      while (xp >= xpForNext(level)) {
        xp -= xpForNext(level);
        level += 1;
      }
    }

    const newQty = foods[tier] - 1;
    const { error: petErr } = await supabase
      .from("pets")
      .update({ level, xp, hatched, species })
      .eq("id", pet.id);
    if (petErr) {
      toast.error("宠物状态更新失败");
      return;
    }
    await supabase
      .from("pet_foods")
      .update({ quantity: newQty })
      .eq("student_id", studentId)
      .eq("tier", tier);
    setFoods((p) => ({ ...p, [tier]: newQty }));
    setPet({ ...pet, level, xp, hatched, species });

    if (!pet.hatched && hatched) {
      toast.success(`🎉 你的蛋孵化出了【${PET_NAME[species!]}】！`);
    } else if (pet.hatched && level > pet.level) {
      toast.success(`⬆️ 升级到 Lv.${level}！`);
    } else {
      toast.success(`+${xpGain} 经验`);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">加载中...</div>;
  }

  if (!pet) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        还没有宠物，请联系老师或重新进入。
      </div>
    );
  }

  const isEgg = !pet.hatched;
  const need = isEgg ? HATCH_XP : xpForNext(pet.level);
  const pct = Math.min(100, Math.round((pet.xp / need) * 100));
  const usedToday = pet.challenges_date === todayStr() ? pet.challenges_today : 0;
  const remainingToday = Math.max(0, DAILY_LIMIT - usedToday);

  return (
    <div className="space-y-6">
      {/* 顶部操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">我的宠物</h2>
        <div className="flex items-center gap-2">
          {editable && (
            <span className="text-xs text-muted-foreground">
              今日剩余 {remainingToday}/{DAILY_LIMIT} 轮
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setRankingOpen(true)}>
            <Trophy className="h-4 w-4" />
            排行榜
          </Button>
          {editable && (
            <Button
              size="sm"
              onClick={() => setChallengeOpen(true)}
              disabled={remainingToday <= 0}
            >
              <Swords className="h-4 w-4" />
              数学挑战
            </Button>
          )}
        </div>
      </div>

      {/* 宠物展示 */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/10 p-8 shadow-[var(--shadow-card)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-56 w-56 grid place-content-center">
            {isEgg ? (
              <img
                src={EGG_IMG}
                alt="宠物蛋"
                className={hatchAnim ? "animate-bounce h-48 w-48" : "h-48 w-48 animate-pulse"}
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <img
                src={petImage(pet.species!, pet.level)}
                alt={PET_NAME[pet.species!]}
                className="h-52 w-52 object-contain"
                style={{ imageRendering: "pixelated", filter: petFilter(pet.level) }}
              />
            )}
            {hatchAnim && (
              <div className="absolute inset-0 grid place-content-center">
                <Sparkles className="h-24 w-24 text-yellow-400 animate-spin" />
              </div>
            )}
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">
              {isEgg ? "宠物蛋" : PET_NAME[pet.species!]}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Lv.{pet.level} {isEgg && "（投喂经验值即可孵化）"}
            </div>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>经验</span>
              <span>{pet.xp} / {need}</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        </div>
      </div>

      {/* 食物背包 + 投喂 */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">食物背包</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["normal", "quality", "elixir"] as FoodTier[]).map((t) => {
            const info = FOOD_INFO[t];
            const qty = foods[t];
            return (
              <div key={t} className="rounded-xl bg-muted/40 p-3 text-center">
                <div className="text-3xl">{info.emoji}</div>
                <div className="mt-1 text-sm font-semibold">{info.name}</div>
                <div className="text-xs text-muted-foreground">+{info.xp} 经验 / 份</div>
                <div className="mt-1 text-lg font-bold text-primary">×{qty}</div>
                {editable && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    disabled={qty <= 0}
                    onClick={() => consumeFood(t)}
                  >
                    投喂
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {editable && (
          <p className="mt-3 text-xs text-muted-foreground">
            通过【数学挑战】答题获得食物：每答对 1 题得 1 份；得分越高食物等级越高。
          </p>
        )}
      </div>

      {challengeOpen && (
        <ChallengeDialog
          open={challengeOpen}
          onOpenChange={setChallengeOpen}
          hatched={pet.hatched}
          onReward={(tier, count) => addFoods(tier, count)}
        />
      )}
      {rankingOpen && (
        <RankingDialog open={rankingOpen} onOpenChange={setRankingOpen} currentStudentId={studentId} />
      )}
    </div>
  );
}

/* ----------------- 数学挑战对话框 ----------------- */
function ChallengeDialog({
  open,
  onOpenChange,
  hatched,
  onReward,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hatched: boolean;
  onReward: (tier: FoodTier, count: number) => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<"setup" | "quiz" | "result">("setup");
  const [modules, setModules] = useState<ChallengeModule[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<null | "right" | "wrong">(null);

  const start = () => {
    const qs = generateChallenge(hatched, modules);
    setQuestions(qs);
    setIdx(0);
    setInput("");
    setScore(0);
    setFeedback(null);
    setPhase("quiz");
  };

  const submit = () => {
    const q = questions[idx];
    const correct = checkAnswer(q, input);
    setFeedback(correct ? "right" : "wrong");
    setScore((s) => s + (correct ? 1 : -1));
    setTimeout(() => {
      setFeedback(null);
      setInput("");
      if (idx + 1 >= questions.length) {
        finish(score + (correct ? 1 : -1));
      } else {
        setIdx(idx + 1);
      }
    }, 700);
  };

  const finish = async (rawScore: number) => {
    const mult = 1 + 0.1 * modules.length;
    const totalXp = Math.max(0, Math.floor(rawScore * mult));
    if (totalXp > 0) {
      const tier = foodTierForScore(rawScore);
      const count = Math.max(1, Math.floor(totalXp / FOOD_INFO[tier].xp));
      await onReward(tier, count);
    }
    setScore(rawScore);
    setPhase("result");
  };

  const reset = () => {
    setPhase("setup");
    setModules([]);
    setQuestions([]);
    setIdx(0);
    setScore(0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>数学挑战 · 10 题</DialogTitle>
        </DialogHeader>

        {phase === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {hatched
                ? "勾选额外题型增加难度，每勾选一项最终得分 +10%。"
                : "孵化前仅整数四则运算。孵化后可解锁更多题型。"}
            </p>
            {hatched && (
              <div className="grid grid-cols-2 gap-2">
                {CHALLENGE_MODULES.map((m) => (
                  <label
                    key={m.key}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={modules.includes(m.key)}
                      onCheckedChange={(v) => {
                        setModules((p) =>
                          v ? [...p, m.key] : p.filter((x) => x !== m.key),
                        );
                      }}
                    />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
            )}
            {hatched && modules.length > 0 && (
              <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
                得分加成：×{(1 + 0.1 * modules.length).toFixed(1)}
              </div>
            )}
            <DialogFooter>
              <Button onClick={start} className="w-full">开始挑战</Button>
            </DialogFooter>
          </div>
        )}

        {phase === "quiz" && questions[idx] && (
          <div className="space-y-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>第 {idx + 1} / {questions.length} 题</span>
              <span>当前得分：{score}</span>
            </div>
            <div className="rounded-xl bg-muted/40 p-6 text-center text-2xl font-bold">
              {questions[idx].prompt}
            </div>
            <Input
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="输入答案后按回车"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !feedback) submit();
              }}
              disabled={feedback !== null}
            />
            {feedback === "right" && (
              <div className="text-center text-green-600 font-semibold">✓ 答对了！+1</div>
            )}
            {feedback === "wrong" && (
              <div className="text-center text-red-600 font-semibold">
                ✗ 答错了！-1（正确答案：{questions[idx].answer}）
              </div>
            )}
            <DialogFooter>
              <Button onClick={submit} disabled={feedback !== null} className="w-full">
                提交
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "result" && (
          <div className="space-y-4 text-center">
            <div className="text-5xl">🎯</div>
            <div className="text-lg">本轮得分</div>
            <div className="text-4xl font-bold text-primary">{score} / 10</div>
            {(() => {
              const mult = 1 + 0.1 * modules.length;
              const totalXp = Math.max(0, Math.floor(score * mult));
              const tier = foodTierForScore(score);
              const info = FOOD_INFO[tier];
              const count = totalXp > 0 ? Math.max(1, Math.floor(totalXp / info.xp)) : 0;
              return totalXp > 0 ? (
                <div className="rounded-xl bg-primary/10 p-4">
                  <div className="text-sm text-muted-foreground">
                    加成 ×{mult.toFixed(1)} → 总经验 {totalXp}，获得：
                  </div>
                  <div className="mt-2 text-2xl">
                    {info.emoji} {info.name} ×{count}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    每份 +{info.xp} 经验
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                  得分不足，没有获得食物，继续加油！
                </div>
              );
            })()}
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={reset} variant="outline" className="w-full">
                再来一轮
              </Button>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                返回宠物
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------- 排行榜对话框 ----------------- */
interface RankRow {
  student_id: string;
  level: number;
  xp: number;
  hatched: boolean;
  species: PetSpecies | null;
  name: string;
}

function RankingDialog({
  open,
  onOpenChange,
  currentStudentId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentStudentId: string;
}) {
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data: petData } = await supabase
        .from("pets")
        .select("student_id, level, xp, hatched, species")
        .order("level", { ascending: false })
        .order("xp", { ascending: false })
        .limit(100);
      const pets = petData ?? [];
      const ids = pets.map((p) => p.student_id);
      const { data: studentData } = ids.length
        ? await supabase.from("students").select("id, name").in("id", ids)
        : { data: [] };
      const nameMap = new Map<string, string>(
        (studentData ?? []).map((s) => [s.id, s.name]),
      );
      const list: RankRow[] = pets.map((d) => ({
        student_id: d.student_id,
        level: d.level,
        xp: d.xp,
        hatched: d.hatched,
        species: d.species as PetSpecies | null,
        name: nameMap.get(d.student_id) ?? "未知",
      }));
      setRows(list);
      setLoading(false);
    })();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            宠物排行榜
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">暂无数据</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              const isMe = r.student_id === currentStudentId;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              return (
                <div
                  key={r.student_id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    isMe ? "bg-primary/10 border border-primary/30" : "bg-muted/40"
                  }`}
                >
                  <div className="w-10 text-center text-sm font-bold">{medal}</div>
                  {r.hatched && r.species ? (
                    <img
                      src={petImage(r.species, r.level)}
                      alt={PET_NAME[r.species]}
                      className="h-10 w-10 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <img src={EGG_IMG} alt="蛋" className="h-10 w-10" style={{ imageRendering: "pixelated" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {r.name} {isMe && <span className="text-xs text-primary">(我)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.hatched && r.species ? PET_NAME[r.species] : "蛋"} · Lv.{r.level} · {r.xp} XP
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
