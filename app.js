(function () {
  'use strict';

  const data = window.ProgramData;
  const $ = (selector) => document.querySelector(selector);
  const els = {
    files: $('#csv-files'), restore: $('#restore-sample'), year: $('#year-filter'), status: $('#data-status'),
    statusText: $('#data-status-text'), fileList: $('#file-list'), summaryContext: $('#summary-context'),
    participants: $('#metric-participants'), graduates: $('#metric-graduates'), rate: $('#metric-rate'),
    programs: $('#metric-programs'), years: $('#metric-years'), attention: $('#metric-attention'),
    pie: $('#pie-chart'), pieLegend: $('#pie-legend'), pieNote: $('#pie-note'), bar: $('#bar-chart'),
    trend: $('#trend-chart'), rows: $('#detail-rows'), rowCount: $('#row-count'), tableEmpty: $('#table-empty'),
    issuesPanel: $('#issues-panel'), issueCount: $('#issue-count'), issues: $('#issues-content'), issuesEmpty: $('#issues-empty'),
    download: $('#download-csv')
  };
  const nf = new Intl.NumberFormat('ko-KR');
  const fieldColors = { '교육': '#f4a261', '일자리': '#6d8bec', '지역사회': '#56b99a', '문화': '#a68ade', '복지': '#e77e91', '환경': '#79b67a', '건강': '#48aab7', '기타': '#9aa6b8', '미분류': '#9aa6b8' };
  const fallbackColors = ['#f4a261', '#6d8bec', '#56b99a', '#a68ade', '#e77e91', '#79b67a', '#48aab7', '#d3a34e', '#71829b'];
  const seriesColors = { participants: '#f3a267', graduates: '#6e8dec' };
  let allRows = [], excluded = [], parseErrors = [], ioErrors = [], fileNames = [];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function fmt(value) { return nf.format(Number(value) || 0); }
  function percent(value, digits) { return value == null || !Number.isFinite(Number(value)) ? '계산 불가' : `${Number(value).toFixed(digits == null ? 0 : digits)}%`; }
  function fieldColor(name) {
    if (fieldColors[name]) return fieldColors[name];
    let hash = 0;
    for (const char of String(name || '')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return fallbackColors[Math.abs(hash) % fallbackColors.length];
  }
  function pathForSlice(cx, cy, radius, start, end) {
    const polar = (angle) => ({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    const a = polar(start), b = polar(end), large = end - start > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`;
  }
  function showEmptyChart(target, title, detail) {
    target.innerHTML = `<div class="chart-empty"><span class="empty-glyph" aria-hidden="true">◌</span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
  }

  function renderPie(summary) {
    const items = (summary.fields || []).filter((field) => Number(field.participants) > 0);
    const total = items.reduce((sum, item) => sum + item.participants, 0);
    if (total <= 0) {
      showEmptyChart(els.pie, '분야별 비중을 계산할 수 없습니다.', '참여자 합계가 0명입니다.');
      els.pieLegend.innerHTML = '';
      els.pieNote.textContent = '참여자 합계가 0명이어서 분야별 비중을 계산할 수 없습니다.';
      return;
    }
    let cursor = -Math.PI / 2;
    const paths = items.length === 1
      ? `<circle cx="120" cy="120" r="91" fill="${fieldColor(items[0].name)}" stroke="#fff" stroke-width="3"><title>${escapeHtml(items[0].name)} · ${fmt(items[0].participants)}명 · ${percent(items[0].share, 1)}</title></circle>`
      : items.map((item) => {
        const start = cursor;
        const end = cursor + (item.participants / total) * Math.PI * 2;
        cursor = end;
        return `<path d="${pathForSlice(120, 120, 91, start, end)}" fill="${fieldColor(item.name)}" stroke="#fff" stroke-width="3"><title>${escapeHtml(item.name)} · ${fmt(item.participants)}명 · ${percent(item.share, 1)}</title></path>`;
      }).join('');
    els.pie.innerHTML = `<svg viewBox="0 0 240 240" role="img" aria-label="분야별 참여 비중 파이 차트">${paths}<circle cx="120" cy="120" r="52" fill="#fff"/><text x="120" y="114" text-anchor="middle" fill="#8a95a7" font-size="11">전체 참여</text><text x="120" y="137" text-anchor="middle" fill="#303b51" font-size="18" font-weight="700">${fmt(total)}명</text></svg>`;
    els.pieLegend.innerHTML = items.map((item) => `<div class="legend-row"><span class="legend-dot" style="background:${fieldColor(item.name)}"></span><span class="legend-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span class="legend-value">${fmt(item.participants)}명 · ${percent(item.share, 1)}</span></div>`).join('');
    els.pieNote.textContent = '분야별 참여자 수와 전체 참여자 대비 비중입니다.';
  }

  function renderBars(summary) {
    const items = summary.programs || [];
    if (!items.length) { showEmptyChart(els.bar, '표시할 사업이 없습니다.', '선택한 자료에 유효한 행이 없습니다.'); return; }
    const chartWidth = Math.max(560, items.length * 92 + 68), chartHeight = 248;
    const left = 42, right = 14, top = 20, bottom = 58, plotH = chartHeight - top - bottom, plotW = chartWidth - left - right;
    const max = Math.max(10, ...items.flatMap((item) => [item.participants || 0, item.graduates || 0]));
    const tick = Math.max(1, Math.ceil(max / 4));
    const scaleMax = tick * 4;
    let grid = '';
    for (let i = 0; i <= 4; i += 1) {
      const y = top + plotH - (i / 4) * plotH;
      grid += `<line x1="${left}" y1="${y}" x2="${chartWidth - right}" y2="${y}" stroke="#edf0f5"/><text x="${left - 8}" y="${y + 3}" text-anchor="end" fill="#7f8b9e" font-size="10">${fmt(tick * i)}</text>`;
    }
    const groupW = plotW / items.length, barW = Math.min(22, groupW * .27);
    const bars = items.map((item, index) => {
      const center = left + groupW * (index + .5);
      const pH = (item.participants / scaleMax) * plotH, gH = (item.graduates / scaleMax) * plotH;
      const label = escapeHtml(item.id || item.name);
      return `<g><rect x="${(center - barW - 2).toFixed(1)}" y="${(top + plotH - pH).toFixed(1)}" width="${barW}" height="${Math.max(0, pH).toFixed(1)}" rx="4" fill="${seriesColors.participants}"><title>${escapeHtml(item.name)} · 참여 ${fmt(item.participants)}명</title></rect><rect x="${(center + 2).toFixed(1)}" y="${(top + plotH - gH).toFixed(1)}" width="${barW}" height="${Math.max(0, gH).toFixed(1)}" rx="4" fill="${seriesColors.graduates}"><title>${escapeHtml(item.name)} · 수료 ${fmt(item.graduates)}명</title></rect><text x="${center}" y="${chartHeight - 42}" text-anchor="middle" fill="#6f7b90" font-size="10">${label}</text><text x="${center}" y="${chartHeight - 27}" text-anchor="middle" fill="#7f8a9d" font-size="10">${escapeHtml(item.name)}</text><text x="${center}" y="${chartHeight - 12}" text-anchor="middle" fill="#586780" font-size="10">${fmt(item.participants)} / ${fmt(item.graduates)}</text></g>`;
    }).join('');
    const legendY = chartHeight - 2;
    els.bar.innerHTML = `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="사업별 참여 및 수료 인원 막대 차트"><text x="4" y="12" fill="#7f8b9e" font-size="10">명</text>${grid}${bars}<g transform="translate(${Math.max(left, chartWidth / 2 - 82)},${legendY})"><rect x="0" y="-7" width="8" height="8" rx="2" fill="${seriesColors.participants}"/><text x="12" y="0" fill="#738097" font-size="10">참여자</text><rect x="75" y="-7" width="8" height="8" rx="2" fill="${seriesColors.graduates}"/><text x="87" y="0" fill="#738097" font-size="10">수료자</text></g></svg>`;
  }

  function renderTrend(summary) {
    const items = (summary.years || []).slice().sort((a, b) => String(a.year).localeCompare(String(b.year), 'ko'));
    if (!items.length) { showEmptyChart(els.trend, '연도별 자료가 없습니다.', '선택한 자료에 유효한 행이 없습니다.'); return; }
    const width = Math.max(670, items.length * 130 + 100), height = 250;
    const left = 48, right = 32, top = 23, bottom = 44, plotH = height - top - bottom, plotW = width - left - right;
    let grid = '';
    [0, 25, 50, 75, 100].forEach((tick) => {
      const y = top + (100 - tick) / 100 * plotH;
      grid += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#edf0f5"/><text x="${left - 10}" y="${y + 3}" text-anchor="end" fill="#7f8b9e" font-size="10">${tick}%</text>`;
    });
    const coords = items.map((item, index) => ({ ...item, x: items.length === 1 ? left + plotW / 2 : left + (index / (items.length - 1)) * plotW, y: item.rate == null ? null : top + (100 - Math.max(0, Math.min(100, item.rate))) / 100 * plotH }));
    const segments = [];
    let current = [];
    coords.forEach((point) => {
      if (point.y == null) { if (current.length) segments.push(current); current = []; }
      else current.push(point);
    });
    if (current.length) segments.push(current);
    const lines = segments.map((segment) => segment.length > 1 ? `<polyline points="${segment.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#6988e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : '').join('');
    const points = coords.map((p) => {
      const label = p.rate == null ? '계산 불가' : percent(p.rate, 1);
      const pointY = p.y == null ? top + plotH - 2 : p.y;
      return `<g><circle cx="${p.x}" cy="${pointY}" r="5" fill="${p.rate == null ? '#a8b1be' : '#fff'}" stroke="${p.rate == null ? '#a8b1be' : '#6988e8'}" stroke-width="3"><title>${escapeHtml(p.year)}년 · ${label} · 참여 ${fmt(p.participants)}명 / 수료 ${fmt(p.graduates)}명</title></circle><text x="${p.x}" y="${p.rate == null ? pointY - 13 : pointY - 13}" text-anchor="middle" fill="${p.rate == null ? '#8c96a6' : '#53627d'}" font-size="10" font-weight="700">${label}</text><text x="${p.x}" y="${height - 17}" text-anchor="middle" fill="#738097" font-size="10">${escapeHtml(p.year)}년</text></g>`;
    }).join('');
    els.trend.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="연도별 참여 합계 기준 가중 수료율 꺾은선 차트">${grid}${lines}${points}</svg>`;
  }

  function renderTable(rows) {
    els.rowCount.textContent = `유효 행 ${fmt(rows.length)}건`;
    els.tableEmpty.classList.toggle('hidden', rows.length !== 0);
    if (!rows.length) { els.rows.innerHTML = ''; return; }
    els.rows.innerHTML = rows.map((row) => {
      const statusClass = row.status === '주의' ? 'status-attention' : row.status === '정상' ? 'status-normal' : 'status-unavailable';
      return `<tr><td>${escapeHtml(row.year)}</td><td>${escapeHtml(row.programId)}</td><td>${escapeHtml(row.programName)}</td><td>${escapeHtml(row.field)}</td><td>${escapeHtml(row.region)}</td><td class="number-cell">${fmt(row.participants)}명</td><td class="number-cell">${fmt(row.graduates)}명</td><td class="number-cell">${percent(row.rate, 1)}</td><td><span class="status-pill ${statusClass}">${escapeHtml(row.status || '계산 불가')}</span></td></tr>`;
    }).join('');
  }

  function renderIssues() {
    const issueTotal = excluded.length + parseErrors.length + ioErrors.length;
    els.issueCount.textContent = `문제 ${fmt(issueTotal)}건`;
    els.issueCount.classList.toggle('has-issues', issueTotal > 0);
    els.issuesEmpty.classList.toggle('hidden', issueTotal > 0);
    const sections = [];
    if (excluded.length) {
      sections.push(`<div class="issue-group"><div class="issue-group-title">제외된 행 <span>${fmt(excluded.length)}건 · 원본 행과 사유</span></div><ul class="issue-list">${excluded.map((item) => {
        const raw = Array.isArray(item.raw) ? item.raw.join(' · ') : String(item.raw == null ? '' : item.raw);
        return `<li class="issue-item"><span>${escapeHtml(item.source)} · ${fmt(item.line)}행</span><span class="issue-reason">${escapeHtml(item.reason)}</span><code class="issue-raw" title="${escapeHtml(raw)}">${escapeHtml(raw || '원본 값 없음')}</code></li>`;
      }).join('')}</ul></div>`);
    }
    const allErrors = [...parseErrors.map((message) => ({ kind: '파일 구조 오류', message })), ...ioErrors.map((message) => ({ kind: '파일 읽기 오류', message }))];
    if (allErrors.length) {
      sections.push(`<div class="issue-group"><div class="issue-group-title">파일 구조·읽기 오류 <span>${fmt(allErrors.length)}건 · 해당 파일은 유효 자료에 포함되지 않음</span></div><ul class="issue-list">${allErrors.map((item) => `<li class="issue-item"><span>${escapeHtml(item.kind)}</span><span class="issue-reason issue-raw">${escapeHtml(item.message)}</span></li>`).join('')}</ul></div>`);
    }
    els.issues.innerHTML = sections.join('');
  }

  function render() {
    const year = els.year.value || 'all';
    const rows = data.filterRows(allRows, year);
    const summary = data.summarize(rows);
    els.participants.innerHTML = `${fmt(summary.participants)}<small>명</small>`;
    els.graduates.innerHTML = `${fmt(summary.graduates)}<small>명</small>`;
    els.rate.innerHTML = summary.rate == null ? '계산 불가' : `${percent(summary.rate, 1)}`;
    els.programs.innerHTML = `${fmt(summary.programCount)}<small>개</small>`;
    els.years.innerHTML = `${fmt(summary.yearCount)}<small>개</small>`;
    els.attention.innerHTML = `${fmt(summary.attentionCount)}<small>건</small>`;
    els.summaryContext.textContent = year === 'all' ? '전체 연도 기준' : `${year}년 기준`;
    renderPie(summary);
    renderBars(summary);
    renderTrend(summary);
    renderTable(rows);
  }

  function updateYears() {
    const current = els.year.value || 'all';
    const years = [...new Set(allRows.map((row) => String(row.year)))].sort((a, b) => a.localeCompare(b, 'ko'));
    els.year.innerHTML = '<option value="all">전체 연도</option>' + years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}년</option>`).join('');
    els.year.value = years.includes(current) ? current : 'all';
  }

  function updateStatus(label) {
    const issueCount = excluded.length + parseErrors.length + ioErrors.length;
    const validCount = allRows.length;
    els.status.classList.toggle('is-error', validCount === 0 && (parseErrors.length + ioErrors.length > 0));
    els.status.classList.toggle('is-warning', issueCount > 0 && !(validCount === 0 && (parseErrors.length + ioErrors.length > 0)));
    const detail = issueCount ? ` 유효 ${fmt(validCount)}행 · 제외/오류 ${fmt(issueCount)}건은 아래에서 확인하세요.` : ` 유효 ${fmt(validCount)}행을 불러왔습니다.`;
    els.statusText.textContent = `${label}${detail}`;
    els.fileList.innerHTML = fileNames.map((name) => `<span class="file-chip"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5l3 3V13H4zM9 2.5v3h3M6 9h4M6 11h4"/></svg><span>${escapeHtml(name)}</span></span>`).join('');
  }

  function setDataset(result, names, label) {
    allRows = result.rows || [];
    excluded = result.excluded || [];
    parseErrors = result.errors || [];
    fileNames = names || [];
    ioErrors = [];
    updateYears();
    updateStatus(label);
    renderIssues();
    render();
  }

  function loadSamples() {
    if (!data || !Array.isArray(data.sampleFiles)) {
      setDataset({ rows: [], excluded: [], errors: ['data.js의 ProgramData.sampleFiles를 찾을 수 없습니다.'] }, [], '샘플 자료를 불러올 수 없습니다.');
      return;
    }
    setDataset(data.parseFiles(data.sampleFiles), data.sampleFiles.map((file) => file.name), '기본 샘플 자료입니다. 정상 자료 3개 파일을 함께 읽었습니다.');
  }

  function readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result == null ? '' : reader.result) });
      reader.onerror = () => resolve({ name: file.name, readError: `${file.name}: 파일을 읽지 못했습니다.` });
      reader.readAsText(file, 'UTF-8');
    });
  }

  els.files.addEventListener('change', async () => {
    const selected = Array.from(els.files.files || []);
    if (!selected.length) return;
    const loaded = await Promise.all(selected.map(readFile));
    const goodFiles = loaded.filter((file) => !file.readError);
    const result = data.parseFiles(goodFiles);
    setDataset(result, selected.map((file) => file.name), '선택한 파일 자료입니다.');
    ioErrors = loaded.filter((file) => file.readError).map((file) => file.readError);
    if (ioErrors.length) {
      updateStatus('일부 파일을 읽지 못했습니다.');
      renderIssues();
    }
    // Let the same file be selected again after restoring samples.
    els.files.value = '';
  });
  els.restore.addEventListener('click', loadSamples);
  els.year.addEventListener('change', render);
  els.download.addEventListener('click', () => {
    const rows = data.filterRows(allRows, els.year.value || 'all');
    const csv = data.exportCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `사업실적_${els.year.value === 'all' ? '전체연도' : els.year.value}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  loadSamples();
})();
