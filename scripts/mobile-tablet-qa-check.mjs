#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
let passCount = 0;
let failCount = 0;

const pass = (message) => {
  passCount += 1;
  console.log(`[PASS] ${message}`);
};

const fail = (message) => {
  failCount += 1;
  console.error(`[FAIL] ${message}`);
};

const expect = (condition, message) => {
  if (condition) pass(message);
  else fail(message);
};

const readText = (relativePath) => {
  const abs = path.join(root, relativePath);
  if (!fs.existsSync(abs)) {
    fail(`파일 누락: ${relativePath}`);
    return null;
  }
  return fs.readFileSync(abs, 'utf8');
};

const contains = (text, pattern) => {
  if (text == null) return false;
  if (pattern instanceof RegExp) return pattern.test(text);
  return text.includes(pattern);
};

const checkSyntax = (relativePath) => {
  const abs = path.join(root, relativePath);
  if (!fs.existsSync(abs)) {
    fail(`syntax 대상 파일 누락: ${relativePath}`);
    return;
  }
  const result = spawnSync('node', ['--check', abs], { encoding: 'utf8' });
  if (result.status === 0) {
    pass(`syntax ok: ${relativePath}`);
  } else {
    fail(`syntax error: ${relativePath}\n${result.stderr || result.stdout}`);
  }
};

const checkViewportMeta = (relativePath) => {
  const text = readText(relativePath);
  if (!text) return;
  expect(
    contains(text, /<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i),
    `viewport meta 존재: ${relativePath}`
  );
};

const checkMobileMediaQuery = (relativePath) => {
  const text = readText(relativePath);
  if (!text) return;
  expect(
    contains(text, /@media\s*\(max-width:\s*\d+px\)/i),
    `mobile media query 존재: ${relativePath}`
  );
};

const checkQuizResultLinksAndCsv = () => {
  const quizIndex = readText('public/quiz/index.html');
  const quizApp = readText('public/quiz/app.js');
  if (!quizIndex || !quizApp) return;

  expect(contains(quizIndex, 'id="result-records-link"'), '퀴즈 결과: 지난 기록 링크 id 존재');
  expect(contains(quizIndex, 'id="result-classroom-link"'), '퀴즈 결과: 학급관리 링크 id 존재');
  expect(contains(quizIndex, 'id="download-report-csv-btn"'), '퀴즈 결과: CSV 다운로드 버튼 존재');

  expect(contains(quizApp, 'syncResultNavigationLinks'), '퀴즈 결과: 링크 컨텍스트 동기화 로직 존재');
  expect(contains(quizApp, 'buildQuizResultReportCsv'), '퀴즈 결과: CSV 리포트 생성 로직 존재');
  expect(contains(quizApp, 'downloadQuizResultReportCsv'), '퀴즈 결과: CSV 리포트 다운로드 로직 존재');
};

const checkJumpmapResultLinksAndCsv = () => {
  const runtime = readText('public/jumpmap-runtime/legacy/compat/runtime-owned/test-runtime.js');
  if (!runtime) return;

  expect(contains(runtime, 'buildResultNavigationHref'), '점프맵 결과: 링크 컨텍스트 생성 로직 존재');
  expect(contains(runtime, 'buildJumpmapResultCsv'), '점프맵 결과: CSV 리포트 생성 로직 존재');
  expect(contains(runtime, '결과 CSV'), '점프맵 결과: CSV 버튼 텍스트 존재');
};

const checkVirtualControlsMobileRules = () => {
  const runtime = readText('public/jumpmap-runtime/legacy/compat/runtime-owned/test-runtime.js');
  if (!runtime) return;

  expect(contains(runtime, 'resolveVirtualControlsLayoutSeparation'), '가상 조작키: 분리 배치 로직 존재');
  expect(contains(runtime, 'VIRTUAL_CONTROL_LAYOUT_MIN_GAP_PX'), '가상 조작키: 최소 간격 상수 존재');
  expect(contains(runtime, 'rectsOverlapWithGap'), '가상 조작키: 오버랩 회피 계산 존재');
  expect(contains(runtime, 'viewportWidth'), '가상 조작키: viewport 폭 기반 계산 존재');
  expect(contains(runtime, 'viewportHeight'), '가상 조작키: viewport 높이 기반 계산 존재');
};

const checkCrossScreenFilterSync = () => {
  const classroom = readText('public/play/classroom/app.js');
  const records = readText('public/play/records/app.js');
  const student = readText('public/play/student/app.js');
  if (!classroom || !records || !student) return;

  expect(contains(classroom, 'leaderboardPeriodSelect'), '학급관리: 리더보드 기간필터 존재');
  expect(contains(classroom, 'writeFiltersToQuery'), '학급관리: 쿼리 동기화 존재');
  expect(contains(records, 'exportFilteredRecordsCsv'), '지난 기록: 필터 기준 CSV 내보내기 존재');
  expect(contains(student, 'exportStudentCsv'), '학생 상세: 필터 기준 CSV 내보내기 존재');
};

const checkPlayerBounds = () => {
  const playApp = readText('public/play/app.js');
  const jumpmapPlay = readText('public/jumpmap-play/app.js');
  if (!playApp || !jumpmapPlay) return;

  expect(
    contains(playApp, /Math\.max\(1,\s*Math\.min\(6,/),
    '플레이 라우터: 플레이어 수 1~6 클램프 존재'
  );
  expect(
    contains(jumpmapPlay, /Math\.max\(1,\s*Math\.min\(6,/),
    '점프맵 시작: 플레이어 수 1~6 클램프 존재'
  );
};

const main = () => {
  console.log('[QA] mobile/tablet static checks');

  const viewportPages = [
    'public/play/index.html',
    'public/play/classroom/index.html',
    'public/play/records/index.html',
    'public/play/student/index.html',
    'public/quiz/index.html',
    'public/jumpmap-play/index.html',
    'public/jumpmap-runtime/index.html'
  ];
  viewportPages.forEach(checkViewportMeta);

  const responsivePages = [
    'public/play/classroom/index.html',
    'public/play/records/index.html',
    'public/play/student/index.html',
    'public/play/index.html',
    'public/quiz/styles.css',
    'public/jumpmap-play/index.html',
    'public/jumpmap-runtime/index.html'
  ];
  responsivePages.forEach(checkMobileMediaQuery);

  checkQuizResultLinksAndCsv();
  checkJumpmapResultLinksAndCsv();
  checkVirtualControlsMobileRules();
  checkCrossScreenFilterSync();
  checkPlayerBounds();

  const syntaxTargets = [
    'public/play/classroom/app.js',
    'public/play/records/app.js',
    'public/play/student/app.js',
    'public/quiz/app.js',
    'public/jumpmap-runtime/legacy/compat/runtime-owned/test-runtime.js'
  ];
  syntaxTargets.forEach(checkSyntax);

  console.log(`\n[SUMMARY] pass=${passCount} fail=${failCount}`);
  if (failCount > 0) process.exit(1);
};

main();
