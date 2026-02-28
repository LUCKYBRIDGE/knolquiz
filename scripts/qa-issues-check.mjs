#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'docs/qa-issues.md');

const ALLOWED_STATUS = new Set([
  'OPEN',
  'IN_PROGRESS',
  'FIXED_PENDING_QA',
  'CLOSED',
  'WONT_FIX'
]);

const ALLOWED_PRIORITY = new Set(['P0', 'P1', 'P2', 'P3']);

const REQUIRED_HEADERS = [
  'ID',
  '상태',
  '우선순위',
  '발견일',
  '화면/기능',
  '환경(기기/브라우저)',
  '재현 단계(요약)',
  '실제 결과',
  '기대 결과',
  '해결커밋',
  '메모'
];

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

const parseTableCells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());

const main = () => {
  console.log('[QA] qa-issues markdown check');

  if (!fs.existsSync(target)) {
    fail('docs/qa-issues.md 파일이 없습니다.');
    finish();
    return;
  }

  const text = fs.readFileSync(target, 'utf8');
  const lines = text.split(/\r?\n/);

  const sectionIndex = lines.findIndex((line) => line.trim() === '## 4) 이슈 로그');
  if (sectionIndex === -1) {
    fail('"## 4) 이슈 로그" 섹션을 찾지 못했습니다.');
    finish();
    return;
  }
  pass('"## 4) 이슈 로그" 섹션 존재');

  const tableHeaderIndex = lines.findIndex(
    (line, idx) => idx > sectionIndex && line.trim().startsWith('| ID |')
  );
  if (tableHeaderIndex === -1) {
    fail('이슈 로그 표의 헤더 행을 찾지 못했습니다.');
    finish();
    return;
  }
  pass('이슈 로그 표 헤더 존재');

  const separatorIndex = tableHeaderIndex + 1;
  if (!lines[separatorIndex] || !lines[separatorIndex].includes('---')) {
    fail('표 구분선(---)이 없습니다.');
    finish();
    return;
  }
  pass('표 구분선 존재');

  const headers = parseTableCells(lines[tableHeaderIndex]);
  if (headers.length !== REQUIRED_HEADERS.length) {
    fail(`헤더 개수 불일치: expected=${REQUIRED_HEADERS.length} actual=${headers.length}`);
  } else {
    const mismatch = REQUIRED_HEADERS.findIndex((name, i) => headers[i] !== name);
    if (mismatch !== -1) {
      fail(`헤더 순서/값 불일치: index=${mismatch} expected="${REQUIRED_HEADERS[mismatch]}" actual="${headers[mismatch]}"`);
    } else {
      pass('헤더 스키마 일치');
    }
  }

  const rows = [];
  for (let i = separatorIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) break;
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) break;
    rows.push({ line, lineNumber: i + 1 });
  }

  if (rows.length === 0) {
    fail('이슈 데이터 행이 0건입니다.');
    finish();
    return;
  }
  pass(`이슈 데이터 행 존재: ${rows.length}건`);

  const seenIds = new Set();

  rows.forEach(({ line, lineNumber }) => {
    const cells = parseTableCells(line);
    if (cells.length !== REQUIRED_HEADERS.length) {
      fail(`L${lineNumber}: 컬럼 개수 불일치`);
      return;
    }

    const [id, status, priority] = cells;

    if (!/^QA-\d{3}$/.test(id)) {
      fail(`L${lineNumber}: ID 형식 오류 (${id})`);
    } else if (seenIds.has(id)) {
      fail(`L${lineNumber}: 중복 ID (${id})`);
    } else {
      seenIds.add(id);
      pass(`L${lineNumber}: ID ok (${id})`);
    }

    if (!ALLOWED_STATUS.has(status)) {
      fail(`L${lineNumber}: 상태값 오류 (${status})`);
    } else {
      pass(`L${lineNumber}: 상태 ok (${status})`);
    }

    if (!ALLOWED_PRIORITY.has(priority)) {
      fail(`L${lineNumber}: 우선순위값 오류 (${priority})`);
    } else {
      pass(`L${lineNumber}: 우선순위 ok (${priority})`);
    }
  });

  finish();
};

const finish = () => {
  console.log(`\n[SUMMARY] pass=${passCount} fail=${failCount}`);
  if (failCount > 0) process.exit(1);
};

main();
