(function (root, makeData) {
  const api = makeData();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ProgramData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const headers = ['연도', '사업ID', '사업명', '분야', '지역', '참여자수', '수료자수'];
  const sampleFiles = [
    { name: '2024.csv', text: '연도,사업ID,사업명,분야,지역,참여자수,수료자수\n2024,P01,디지털 기초 교실,교육,서울,80,60\n2024,P02,청소년 진로 탐색,교육,부산,60,48\n2024,P03,경력 전환 지원,일자리,경기,50,34\n2024,P04,사회적기업 인턴십,일자리,인천,100,90\n2024,P05,마을 돌봄 연결,지역사회,대전,70,60\n2024,P06,자원봉사 성장학교,지역사회,광주,40,28' },
    { name: '2025.csv', text: '연도,사업ID,사업명,분야,지역,참여자수,수료자수\n2025,P01,디지털 기초 교실,교육,서울,90,70\n2025,P02,청소년 진로 탐색,교육,부산,80,66\n2025,P03,경력 전환 지원,일자리,경기,60,43\n2025,P04,사회적기업 인턴십,일자리,인천,115,107\n2025,P05,마을 돌봄 연결,지역사회,대전,75,66\n2025,P06,자원봉사 성장학교,지역사회,광주,50,36' },
    { name: '2026.csv', text: '연도,사업ID,사업명,분야,지역,참여자수,수료자수\n2026,P01,디지털 기초 교실,교육,서울,100,81\n2026,P02,청소년 진로 탐색,교육,부산,100,86\n2026,P03,경력 전환 지원,일자리,경기,70,52\n2026,P04,사회적기업 인턴십,일자리,인천,130,125\n2026,P05,마을 돌봄 연결,지역사회,대전,80,73\n2026,P06,자원봉사 성장학교,지역사회,광주,60,46' }
  ];

  // RFC 4180-style parser that retains the physical starting line for each record.
  function parseCSV(text) {
    const input = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    const records = [];
    let row = [], field = '', quoted = false, line = 1, recordLine = 1;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else {
          field += ch;
          if (ch === '\n') line += 1;
          else if (ch === '\r') {
            if (input[i + 1] === '\n') { field += '\n'; i += 1; }
            line += 1;
          }
        }
        continue;
      }
      if (ch === '"') {
        if (field.length) throw new Error(`CSV ${line}행: 따옴표 위치가 올바르지 않습니다.`);
        quoted = true;
      } else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        row.push(field); field = '';
        // Ignore a final empty record but preserve intentional empty fields in records.
        if (!(row.length === 1 && row[0] === '' && i === input.length - 1)) records.push({ values: row, line: recordLine });
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i += 1;
        line += 1; recordLine = line;
      } else field += ch;
    }
    if (quoted) throw new Error(`CSV ${recordLine}행: 따옴표가 닫히지 않았습니다.`);
    if (field.length || row.length || input.length === 0 || !/[\r\n]$/.test(input)) {
      row.push(field);
      if (!(row.length === 1 && row[0] === '' && records.length === 0)) records.push({ values: row, line: recordLine });
    }
    return records;
  }

  function parseFiles(files) {
    const rows = [], excluded = [], errors = [], seen = new Set();
    if (!Array.isArray(files)) return { rows, excluded, errors: ['파일 목록 형식이 올바르지 않습니다.'] };
    for (const file of files) {
      const source = file && file.name ? String(file.name) : '(이름 없는 파일)';
      let records;
      try {
        records = parseCSV(file && file.text);
      } catch (error) {
        errors.push(`${source}: ${error.message || 'CSV를 읽을 수 없습니다.'}`);
        continue;
      }
      if (!records.length) { errors.push(`${source}: CSV에 헤더가 없습니다.`); continue; }
      const actualHeaders = records[0].values.map((v) => v.trim());
      if (actualHeaders.length !== headers.length || headers.some((h, i) => actualHeaders[i] !== h)) {
        errors.push(`${source}: 헤더는 ${headers.join(',')} 순서의 7개 열이어야 합니다.`);
        continue;
      }
      for (const record of records.slice(1)) {
        const values = record.values;
        const raw = values.slice();
        const reject = (reason) => excluded.push({ source, line: record.line, reason, raw });
        if (values.length !== headers.length) { reject(`열 개수가 ${headers.length}개가 아닙니다.`); continue; }
        const [yearText, idText, nameText, fieldText, regionText, participantsText, graduatesText] = values.map((v) => v.trim());
        if (!yearText || !/^\d{4}$/.test(yearText)) { reject('연도가 없거나 4자리 숫자가 아닙니다.'); continue; }
        if (!idText) { reject('사업ID가 비어 있습니다.'); continue; }
        if (!nameText || !fieldText || !regionText) { reject('사업명, 분야, 지역은 필수입니다.'); continue; }
        if (participantsText === '' || graduatesText === '') { reject('참여자수 또는 수료자수가 비어 있습니다.'); continue; }
        if (!/^\d+$/.test(participantsText) || !/^\d+$/.test(graduatesText)) { reject('참여자수와 수료자수는 비음수 정수여야 합니다.'); continue; }
        const participants = Number(participantsText), graduates = Number(graduatesText);
        if (!Number.isSafeInteger(participants) || !Number.isSafeInteger(graduates)) { reject('참여자수 또는 수료자수가 안전한 정수 범위를 벗어났습니다.'); continue; }
        if (graduates > participants) { reject('수료자수가 참여자수보다 많습니다.'); continue; }
        const key = `${yearText}\u0000${idText}`;
        if (seen.has(key)) { reject('같은 연도와 사업ID의 중복 행입니다. 첫 유효 행만 남깁니다.'); continue; }
        seen.add(key);
        const rate = participants === 0 ? null : graduates / participants * 100;
        rows.push({ year: yearText, programId: idText, programName: nameText, field: fieldText, region: regionText, participants, graduates, rate, status: rate === null ? '계산 불가' : (rate < 80 ? '주의' : '정상'), source, line: record.line });
      }
    }
    return { rows, excluded, errors };
  }

  function filterRows(rows, year) {
    const safeRows = Array.isArray(rows) ? rows : [];
    return year == null || year === 'all' ? safeRows.slice() : safeRows.filter((row) => String(row.year) === String(year));
  }

  function summarize(inputRows) {
    const rows = Array.isArray(inputRows) ? inputRows : [];
    const participants = rows.reduce((sum, row) => sum + (Number(row.participants) || 0), 0);
    const graduates = rows.reduce((sum, row) => sum + (Number(row.graduates) || 0), 0);
    const rate = participants === 0 ? null : graduates / participants * 100;
    const fieldMap = new Map(), programMap = new Map(), yearMap = new Map();
    for (const row of rows) {
      const field = row.field || '미분류';
      fieldMap.set(field, (fieldMap.get(field) || 0) + (Number(row.participants) || 0));
      const pkey = `${row.programId || ''}\u0000${row.programName || ''}`;
      if (!programMap.has(pkey)) programMap.set(pkey, { id: row.programId || '', name: row.programName || '', participants: 0, graduates: 0 });
      const program = programMap.get(pkey);
      program.participants += Number(row.participants) || 0;
      program.graduates += Number(row.graduates) || 0;
      const year = String(row.year || '');
      if (!yearMap.has(year)) yearMap.set(year, { year, participants: 0, graduates: 0 });
      const yearItem = yearMap.get(year);
      yearItem.participants += Number(row.participants) || 0;
      yearItem.graduates += Number(row.graduates) || 0;
    }
    return {
      participants, graduates, rate, programCount: programMap.size, yearCount: yearMap.size,
      attentionCount: rows.filter((row) => row.status === '주의').length,
      fields: Array.from(fieldMap, ([name, amount]) => ({ name, participants: amount, share: participants === 0 ? null : amount / participants * 100 })),
      programs: Array.from(programMap.values()),
      years: Array.from(yearMap.values()).map((item) => ({ ...item, rate: item.participants === 0 ? null : item.graduates / item.participants * 100 }))
    };
  }

  function escapeCSV(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCSV(rows) {
    const lines = [headers.map(escapeCSV).join(',')];
    for (const row of Array.isArray(rows) ? rows : []) {
      lines.push([row.year, row.programId, row.programName, row.field, row.region, row.participants, row.graduates].map(escapeCSV).join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  return { headers, sampleFiles, parseFiles, filterRows, summarize, exportCSV };
});
