'use strict';
/* ═══════════════════════════════════════════════════════════════
   📊 퀴즈 (객관식 4지선다) — 장소마다 한 판
   · AI 채팅이 아니다. 문제를 내고 보기를 고르면 맞고 틀림이 바로 나온다.
   · 맞히면 점수 +, 틀리면 점수 −. 마지막에 합계로 기록을 남긴다.
   · 화면 아래 가운데 큰 카드는 옛 「에코시티 남산」 대화창 배치를 가져왔다.
     (초록이·연습 모드·힌트·자유 입력은 전부 뺐다)

   ★ 문제와 장소는 js/games/quiz-data.js 의 G.QUIZ_TOPICS 에 있다. 이 파일은 진행만 맡는다.
     주제를 하나 더 넣고 싶으면 거기에 덩이를 하나 더 붙이면 지도에 자리가 생긴다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$;

  /* ── 난이도 (모든 퀴즈 장소가 함께 쓴다) ── */
  const CFG = {
    ask: 8,              // 한 판에 낼 문제 수 (문제은행에서 섞어 뽑는다)
    right: 150,          // 맞혔을 때
    wrong: -60,          // 틀렸을 때
    stars: [900, 550],   // ★★★ / ★★ 기준 점수
  };
  /* 점수를 크게 잡은 이유: 다른 미니게임의 최고 기록이 250~700점대라
     퀴즈가 10점짜리면 아이들이 굳이 풀 이유가 없다. 8문제 다 맞히면 1200점으로
     이 도시에서 가장 큰 숫자가 나오게 했다. 대신 틀리면 60점씩 깎인다. */

  /** 장소마다 그 자리를 남쪽에서 바라본다 */
  function camFor(spot) {
    return {
      pos: new T.Vector3(spot.x, 7.2, spot.z + 17),
      look: new T.Vector3(spot.x - 2, 2.2, spot.z - 1),
    };
  }

  let st = null;         // 지금 진행 중인 판 (퀴즈는 한 번에 하나만 돈다)
  let cam = null;        // 지금 장소의 카메라
  const ui = {};
  let uiBuilt = false;

  /* ═══════════ 화면 ═══════════ */
  function buildUi(ctx) {
    if (uiBuilt) return;   // 장소가 여럿이어도 카드는 하나만 만든다
    uiBuilt = true;
    const wrap = document.createElement('div');
    wrap.id = 'quizDock';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div id="quizHead">' +
        '<span id="quizNo"></span>' +
        '<span id="quizScore"></span>' +
      '</div>' +
      '<div id="quizBody">' +
        '<p id="quizQ"></p>' +
        '<div id="quizChoices"></div>' +
        '<div id="quizFeed" hidden><b id="quizVerdict"></b><span id="quizWhy"></span></div>' +
      '</div>' +
      '<div id="quizFoot"><button id="quizNext" type="button"></button></div>';
    ctx.layer.appendChild(wrap);

    ui.wrap = wrap;
    ui.no = $('quizNo'); ui.score = $('quizScore');
    ui.q = $('quizQ'); ui.choices = $('quizChoices');
    ui.feed = $('quizFeed'); ui.verdict = $('quizVerdict'); ui.why = $('quizWhy');
    ui.foot = $('quizFoot'); ui.next = $('quizNext');

    // 보기 버튼 4개를 미리 만들어 두고 글자만 갈아 끼운다 (프레임마다 DOM을 만들지 않는다)
    ui.btns = [];
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quizChoice';
      b.innerHTML = '<i></i><span></span>';
      // click 은 손가락이 조금 미끄러지면 취소된다 → 누르는 순간 반응
      b.addEventListener('pointerdown', ev => { ev.preventDefault(); pick(i, ctx); });
      b.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(i, ctx); }
      });
      ui.choices.appendChild(b);
      ui.btns.push(b);
    }
    ui.next.addEventListener('pointerdown', ev => { ev.preventDefault(); next(ctx); });
    ui.next.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); next(ctx); }
    });
  }

  /** 배열을 섞는다 (원본은 건드리지 않는다) */
  const shuffled = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /** 한 판에 낼 문제를 뽑고, 보기 순서도 섞는다 */
  function makeRound(bank) {
    return shuffled(bank).slice(0, Math.min(CFG.ask, bank.length)).map(q => {
      const order = shuffled(q.choices.map((c, i) => i));
      return {
        question: q.question,
        explain: q.explain,
        choices: order.map(i => q.choices[i]),
        answer: order.indexOf(q.answer),   // 섞인 뒤의 정답 자리
      };
    });
  }

  const NUM = ['①', '②', '③', '④'];

  function paint(ctx) {
    const q = st.list[st.i];
    ui.no.textContent = `문제 ${st.i + 1} / ${st.list.length}`;
    ui.score.textContent = `${st.score}점`;
    ui.score.className = st.score < 0 ? 'minus' : '';
    ui.q.textContent = q.question;

    ui.btns.forEach((b, i) => {
      const has = i < q.choices.length;
      b.hidden = !has;
      if (!has) return;
      b.firstChild.textContent = NUM[i];
      b.lastChild.textContent = q.choices[i];
      b.className = 'quizChoice';
      b.disabled = false;
    });

    ui.feed.hidden = true;
    ui.foot.hidden = true;
    stats(ctx);
  }

  function pick(i, ctx) {
    if (!st || st.locked) return;          // 한 문제당 한 번만 채점한다
    const q = st.list[st.i];
    if (i >= q.choices.length) return;
    st.locked = true;

    const ok = i === q.answer;
    st.score += ok ? CFG.right : CFG.wrong;
    if (ok) st.right++; else st.wrong++;

    ui.btns.forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add('right');
      else if (k === i) b.classList.add('wrong');
      b.blur();                            // 초점이 남으면 Space 가 이 버튼으로 먹힌다
    });

    ui.score.textContent = `${st.score}점`;
    ui.score.className = st.score < 0 ? 'minus' : '';

    ui.verdict.textContent = ok ? '맞았어요!' : '아쉬워요';
    ui.verdict.className = ok ? 'right' : 'wrong';
    ui.why.textContent = q.explain;
    ui.feed.hidden = false;

    ui.next.textContent = st.i + 1 >= st.list.length
      ? '결과 보기'
      : (G.touch ? '다음 문제 ▶' : '다음 문제 ▶ (Space)');
    ui.foot.hidden = false;
    setTimeout(() => { if (st && st.locked) ui.next.focus({ preventScroll: true }); }, 30);

    G.sfx.play(ok ? 'ding' : 'hmm');
    ctx.flash(ok ? `+${CFG.right}` : `${CFG.wrong}`, ok ? 'good' : 'bad', 700);
    stats(ctx);
  }

  function next(ctx) {
    if (!st || !st.locked) return;
    ui.next.blur();
    if (st.i + 1 >= st.list.length) { done(ctx); return; }
    st.i++;
    st.locked = false;
    paint(ctx);
  }

  function done(ctx) {
    const stars = st.score >= CFG.stars[0] ? 3 : st.score >= CFG.stars[1] ? 2 : 1;
    const max = st.list.length * CFG.right;
    // finish 는 숫자가 아니라 객체를 받는다 (record/success 가 없으면 기록이 안 남는다)
    ctx.finish({
      success: stars >= 2,
      record: st.score,
      // 마을 점수: 틀려서 깎인 만큼 그대로 반영된다 (음수면 0)
      progress: st.score / max,
      big: `${st.score}점`,
      title: stars === 3 ? `척척박사! ${'★'.repeat(stars)}`
           : stars === 2 ? `잘했어요! ${'★'.repeat(stars)}☆`
           : '다시 한 번! ★☆☆',
      lines: [
        `맞힌 문제 <b>${st.right}</b> / ${st.list.length}   (만점 ${max}점)`,
        st.wrong ? `틀린 문제 ${st.wrong}개 — 설명을 다시 읽어 보면 다음엔 쉬워요` : '하나도 안 틀렸어요! 대단해요',
        stars < 3 ? `★★★까지: ${CFG.stars[0]}점` : '문제와 보기는 판마다 섞여요. 한 번 더?',
      ],
    });
  }

  function stats(ctx) {
    ctx.setStats([
      { label: '점수', value: `${st.score}점`, warn: st.score < 0 },
      { label: '맞힘', value: `${st.right}` },
      { label: '문제', value: `${st.i + 1}/${st.list.length}` },
    ]);
  }

  /* ═══════════ 등록 — 문제은행 한 덩이 = 지도 위 자리 하나 ═══════════ */
  const topics = G.QUIZ_TOPICS || [];
  if (!topics.length) console.warn('[quiz] 문제은행이 없습니다 — js/games/quiz-data.js 를 먼저 불러오세요');

  for (const topic of topics) {
    // 장소마다 좌표를 마커 표에 넣어 준다 (places.js 에 일일이 적지 않아도 되게)
    G.SPOTS[topic.id] = topic.spot;

    G.registerGame({
      id: topic.id,
      name: topic.name,
      icon: topic.icon,
      color: topic.color,
      place: topic.place,
      tagline: '보기 넷 중 하나! 맞히면 점수가 오르고 틀리면 깎여요.',
      rules: [
        `한 판에 <b>${CFG.ask}문제</b> — 문제와 보기는 <b>판마다 섞여요</b>`,
        `맞히면 <b>+${CFG.right}점</b>, 틀리면 <b>${CFG.wrong}점</b>`,
        '고르면 바로 <b>정답과 한 줄 설명</b>이 나와요',
        `합계 <b>${CFG.stars[0]}점</b>이면 ★★★, <b>${CFG.stars[1]}점</b>이면 ★★`,
      ],
      controlsKey: '숫자 1~4 또는 클릭 = 보기 고르기 · Space = 다음 문제 · Esc 잠깐 멈춤',
      controlsTouch: '보기를 손가락으로 톡 · 「다음 문제」 누르기',
      format: v => `${v}점`,
      better: (a, b) => a > b,
      world: 'city',
      spotRadius: 3.0,
      cfg: CFG,                 // 시험·문서가 숫자를 베끼지 않고 여기서 읽어 간다
      maxPts: 1500,             // 다른 게임(1000)보다 크게 — 퀴즈를 풀 이유를 만든다
      bank: topic.questions,    // 이 자리의 문제은행
      debug: () => st,

      init(ctx) { buildUi(ctx); },

      enter(ctx) {
        ui.wrap.hidden = false;
        G.explore.setMarkersVisible(false);
        cam = camFor(topic.spot);
        ctx.snapCamera(cam.pos, cam.look);
        st = null;
      },

      start(ctx) {
        st = { list: makeRound(topic.questions), i: 0, score: 0, right: 0, wrong: 0, locked: false };
        paint(ctx);
        ctx.hint('');   // 카드만 봐도 아는 화면이라 아래 안내줄은 쓰지 않는다 (버튼을 가린다)
      },

      update(dt, now, ctx) {
        // 카메라만 천천히 자리를 잡는다. 퀴즈는 프레임마다 할 일이 없다
        if (cam) ctx.easeCamera(cam.pos, cam.look, dt, 3);
      },

      onKey(e, down, ctx) {
        if (!down || !st) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
          if (st.locked) { e.preventDefault(); next(ctx); }
          return;
        }
        const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
        if (m) { e.preventDefault(); pick(Number(m[1]) - 1, ctx); }
      },

      exit(ctx) {
        ui.wrap.hidden = true;
        G.explore.setMarkersVisible(true);
        st = null;
        cam = null;
      },
    });
  }
})(window.G);
