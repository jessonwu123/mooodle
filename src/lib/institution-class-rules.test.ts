import {test} from "node:test";
import assert from "node:assert/strict";
import {canCreateStudentLogin,isInstitutionClass,institutionClassKey} from "./institution-class-rules";
test("机构班级不能创建学生登录账号",()=>assert.equal(canCreateStudentLogin("institution_class"),false));
test("普通学生仍可创建登录账号",()=>assert.equal(canCreateStudentLogin("student"),true));
test("机构班级课程为只读",()=>assert.equal(isInstitutionClass("institution_class"),true));
test("按课表名字分组，仅忽略首尾空格",()=>{assert.equal(institutionClassKey(" AMC8班 "),"AMC8班");assert.notEqual(institutionClassKey("AMC8班A"),institutionClassKey("AMC8班B"));});