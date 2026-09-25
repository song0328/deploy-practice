'use strict';
/* ═══════════════════════════════════════════════════════════════
   🌍 지구 지킴이 퀴즈 — 놀이초등학교 운동장 (객관식 4지선다)
   · AI 채팅이 아니다. 문제를 내고 보기를 고르면 맞고 틀림이 바로 나온다.
   · 맞히면 점수 +, 틀리면 점수 −. 마지막에 합계로 기록을 남긴다.
   · 화면 아래 가운데 큰 카드는 옛 「에코시티 남산」 대화창 배치를 가져왔다.
     (초록이·연습 모드·힌트·자유 입력은 전부 뺐다)

   ★ 문제를 고치거나 늘리려면 아래 QUIZ 배열만 손대면 된다. 3D 코드는 건드릴 일이 없다.
   ═══════════════════════════════════════════════════════════════ */
(function (G) {
  const T = THREE, $ = G.$;

  /* ── 난이도 ── */
  const CFG = {
    ask: 8,              // 한 판에 낼 문제 수 (QUIZ에서 섞어 뽑는다)
    right: 150,          // 맞혔을 때
    wrong: -60,          // 틀렸을 때
    stars: [900, 550],   // ★★★ / ★★ 기준 점수
  };
  /* 점수를 크게 잡은 이유: 다른 미니게임의 최고 기록이 250~700점대라
     퀴즈가 10점짜리면 아이들이 굳이 풀 이유가 없다. 8문제 다 맞히면 1200점으로
     이 도시에서 가장 큰 숫자가 나오게 했다. 대신 틀리면 60점씩 깎인다. */

  /* ── 문제 은행 ──────────────────────────────────────────────
     question 문제 · choices 보기(4개) · answer 정답 번호(0부터) · explain 고른 뒤 한 줄
     보기 순서는 판마다 섞이므로 「①번이 정답」 같은 문장은 쓰지 말 것. */
  const QUIZ = [
    {
      question: '한여름에 에어컨을 켠 채 창문을 활짝 열어 두면 어떻게 될까요?',
      choices: ['시원한 바람이 들어와 전기를 아낀다', '들어온 더운 공기를 계속 식히느라 전기를 더 쓴다',
                '에어컨이 저절로 꺼진다', '아무 차이가 없다'],
      answer: 1,
      explain: '식힌 공기가 밖으로 빠져나가고 더운 공기가 들어와서, 에어컨이 쉬지 못하고 계속 돌아요.',
    },
    {
      question: '태양광 패널을 지붕에 놓을 때 가장 중요한 것은?',
      choices: ['패널의 색깔', '하루 동안 햇빛을 얼마나 오래 받는가',
                '지붕이 평평한가 기울었는가만', '건물이 지어진 연도'],
      answer: 1,
      explain: '옆 건물 그림자에 가리면 같은 패널이라도 전기를 훨씬 적게 만들어요.',
    },
    {
      question: '페트병을 분리배출할 때 맞게 한 것은?',
      choices: ['상표와 뚜껑을 그대로 두고 버린다', '내용물만 비우고 그대로 버린다',
                '상표를 떼고 찌그러뜨린 뒤 버린다', '다른 플라스틱과 섞어서 버린다'],
      answer: 2,
      explain: '상표를 떼고 납작하게 누르면 더 깨끗하게, 더 많이 다시 쓸 수 있어요.',
    },
    {
      question: '자동차가 시동을 켠 채 멈춰 서 있는 것을 무엇이라 할까요?',
      choices: ['공회전', '주차', '서행', '정속 주행'],
      answer: 0,
      explain: '공회전은 가지도 않으면서 기름을 태워 매연만 내보내요.',
    },
    {
      question: '「탄소중립」은 무슨 뜻일까요?',
      choices: ['탄소를 하나도 만들지 않는 것', '내보낸 만큼 도로 흡수해 실제로 늘어난 양을 0으로 만드는 것',
                '탄소를 땅에 묻는 것만', '석탄을 더 많이 쓰는 것'],
      answer: 1,
      explain: '내보내는 양을 줄이고, 남은 만큼은 숲 같은 것이 흡수해서 더하기 빼기 0으로 만드는 거예요.',
    },
    {
      question: '도시에 나무와 공원을 늘리면 여름에 어떤 일이 생길까요?',
      choices: ['기온이 더 올라간다', '그늘과 수분 덕분에 주변이 시원해진다',
                '비가 아예 안 온다', '바람이 완전히 멈춘다'],
      answer: 1,
      explain: '아스팔트만 있는 곳은 푹푹 찌지만, 나무 그늘 아래는 몇 도나 시원해요.',
    },
    {
      question: '다음 중 재생에너지가 아닌 것은?',
      choices: ['태양광', '풍력', '석탄 화력', '수력'],
      answer: 2,
      explain: '석탄은 땅에서 캐서 태우면 사라져요. 햇빛·바람·물은 계속 다시 와요.',
    },
    {
      question: '아무도 없는 교실에 불과 에어컨이 켜져 있다면 가장 먼저 할 일은?',
      choices: ['그대로 둔다', '창문을 연다', '스위치를 꺼 둔다', '에어컨 온도를 더 낮춘다'],
      answer: 2,
      explain: '쓰지 않는 전기를 끄는 것은, 전기를 새로 만드는 것만큼 힘이 세요.',
    },
    {
      question: '지하주차장 조명을 사람이 지나갈 때만 켜지게 하려면 무엇이 필요할까요?',
      choices: ['더 밝은 전구', '사람을 알아보는 감지 센서', '더 굵은 전선', '더 큰 스위치'],
      answer: 1,
      explain: '감지 센서가 있으면 아무도 없을 때 저절로 꺼져서 낮에도 켜 둘 일이 없어요.',
    },
    {
      question: '가까운 거리를 갈 때 탄소를 가장 적게 내보내는 방법은?',
      choices: ['혼자 자동차 타기', '걷거나 자전거 타기', '택시 타기', '오토바이 타기'],
      answer: 1,
      explain: '걷기와 자전거는 탄소가 0이에요. 여럿이 함께 타는 버스·지하철이 그다음이고요.',
    },
    {
      question: '겨울에 창문 틈으로 찬바람이 들어올 때 가장 도움이 되는 것은?',
      choices: ['보일러 온도를 더 올린다', '창문 단열(이중창·틈막이)을 한다',
                '창문을 더 자주 연다', '커튼을 걷어 둔다'],
      answer: 1,
      explain: '새는 곳을 막으면 보일러가 덜 일해도 따뜻해요. 온도만 올리면 열이 계속 새요.',
    },
    {
      question: '음식물 쓰레기를 줄이면 왜 탄소가 줄어들까요?',
      choices: ['음식물이 썩으면서 온실가스가 나오기 때문에', '음식이 무겁기 때문에',
                '음식물은 재활용이 안 되기 때문에', '관련이 전혀 없다'],
      answer: 0,
      explain: '썩는 과정에서 메탄이 나와요. 기르고 옮기는 데 든 에너지까지 버려지는 셈이고요.',
    },
  ];

  /* ── 카메라 (운동장을 남쪽에서 바라본다) ── */
  const camPos = new T.Vector3(64, 7.2, 88);
  const camLook = new T.Vector3(62, 2.2, 70);

  let st = null;
  const ui = {};

  /* ═══════════ 화면 ═══════════ */
  function buildUi(ctx) {
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
  function makeRound() {
    return shuffled(QUIZ).slice(0, Math.min(CFG.ask, QUIZ.length)).map(q => {
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
      big: `${st.score}점`,
      title: stars === 3 ? `지구 지킴이! ${'★'.repeat(stars)}`
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

  /* ═══════════ 등록 ═══════════ */
  G.registerGame({
    id: 'quiz',
    name: '지구 지킴이 퀴즈',
    icon: '🌍',
    color: '#3ED47E',
    place: '놀이초등학교 운동장 (학교 정문 → 운동장 입구)',
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
    debug: () => st,

    init(ctx) { buildUi(ctx); },

    enter(ctx) {
      ui.wrap.hidden = false;
      G.explore.setMarkersVisible(false);
      ctx.snapCamera(camPos, camLook);
      st = null;
    },

    start(ctx) {
      st = { list: makeRound(), i: 0, score: 0, right: 0, wrong: 0, locked: false };
      paint(ctx);
      ctx.hint('');   // 카드만 봐도 아는 화면이라 아래 안내줄은 쓰지 않는다 (버튼을 가린다)
    },

    update(dt, now, ctx) {
      // 카메라만 천천히 자리를 잡는다. 퀴즈는 프레임마다 할 일이 없다
      ctx.easeCamera(camPos, camLook, dt, 3);
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
    },
  });
})(window.G);
