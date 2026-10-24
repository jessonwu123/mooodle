import { describe, it, expect } from "vitest";
import "../../extension/matching.js";
const matching = (globalThis as unknown as { MeetingMatching: { rank: (title: string, sessions: { name: string; studentName: string; time: string }[]) => {matchScore:number}[] } }).MeetingMatching;
const session = (name: string) => ({name, studentName:name, time:"10:00"});
describe("课堂关键名字匹配", () => {
  it("不同课堂标题可通过关键名字匹配", () => expect(matching.rank("Vincent 数学课 录制", [session("Vincent")])[0]?.matchScore).toBe(80));
  it("中文姓名可嵌入课堂标题", () => expect(matching.rank("张小明数学课", [session("张小明")])[0]?.matchScore).toBe(80));
  it("不把英文名字子串匹配到其他姓名", () => expect(matching.rank("Joanna 数学课", [session("Ann")])[0]?.matchScore).toBe(0));
  it("不使用通用科目匹配", () => expect(matching.rank("数学课", [session("数学")])[0]?.matchScore).toBe(0));
  it("相同关键名字的多个课次保留为歧义候选", () => expect(matching.rank("Vincent 数学课", [session("Vincent"), session("Vincent")]).filter(s => s.matchScore === 80)).toHaveLength(2));
});