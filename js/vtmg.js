const p0 = 100000;
const marblesPercents = [
  { proba: 65, color: "black", wins: 0 },
  { proba: 15, color: "blue", wins: 1 },
  { proba: 7, color: "green", wins: 2 },
  { proba: 6, color: "yellow", wins: 3 },
  { proba: 3, color: "silver", wins: 5 },
  { proba: 2, color: "gold", wins: 10 },
  { proba: 2, color: "pink", wins: 20 },
];
const svg = (path) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" /></svg>`;
const iconUp = svg(
  "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z"
);
const iconDown = svg(
  "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z"
);

const elems = {};
const $ = (id) => {
  if (!elems[id]) {
    elems[id] = document.getElementById(id);
  }
  return elems[id];
};

let marbleValues = {};
const marbles = [];
marblesPercents.forEach((mp) => {
  marbleValues[mp.color] = mp.wins;
  for (let i = 0; i < mp.proba; i++) {
    marbles.push(mp.color);
  }
});

const drawMarble = () => marbles[Math.floor(Math.random() * 100)];

const fCurrency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);

const cfCurrency = (n) =>
  `<span class="${n > 0 ? "green" : "red"}">${
    (n > 0 ? "+" : "") + fCurrency(n)
  }</span>`;

const percentBox = (n) => {
  const fNum = new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 2,
  }).format(n);
  return `<div class="pc ${n < 0 ? "pc-red" : "pc-green"}">${
    n < 0 ? iconDown : iconUp
  } ${fNum.replace("-", "")}%</div>`;
};

const marblesInfo = () =>
  '<div class="info">' +
  marblesPercents
    ?.map(
      (m) =>
        `<div><div class="m ${m.color}"></div> Win ${m.wins}x, ${m.proba}% of the times</div>`
    )
    .join("") +
  "</div>";

const runSim = (amount, unit) => {
  let pValue = p0;
  const steps = [];
  for (let i = 1; i < 101; i++) {
    debugger;
    const bet = unit === "$" ? amount : (pValue * amount) / 100;
    const color = drawMarble();
    const xWin = marbleValues[color] - 1;
    const win = bet * xWin;
    const portfolioPc = unit === "$" ? (win / pValue) * 100 : xWin * amount;

    pValue += win;
    steps.push({
      id: i,
      color,
      bet: fCurrency(bet),
      win,
      x: xWin,
      wins: fCurrency(win),
      portfolio: fCurrency(pValue),
      portfolioPc,
    });
    if (pValue < 1 || (unit === "$" && pValue < amount)) {
      break;
    }
  }
  const wins = pValue - p0;
  const totalWin = `<div>${percentBox(Math.round((100 * wins) / p0))}</div>`;
  const footerSummary = `<div class="footer-summary">${percentBox(
    Math.round((100 * wins) / p0)
  )} $100K to ${fCurrency(100000 + wins)} </div>`;

  return {
    steps,
    wins,
    summary: totalWin,
    footerSummary,
  };
};

let data = null;
const header = `<tr><td>#</td><td>Marble</td><td>Bet</td><td>$ Winnings</td><td>% Winnings</td><td>Portfolio</td></tr>`;

const iterate = () => {
  const amount = $("amount").value || 0;
  const unit = $("unit").value;

  if ((unit === "$" && amount > p0) || (unit === "%" && amount > 100)) {
    alert("You can't bet more than you have!");
    return;
  }
  data = runSim(amount, unit);
  steps = data?.steps?.map(
    (s) =>
      `<tr><td>${s.id}</td><td><div class="m ${s.color}"></div></td><td>${
        s.bet
      }</td><td>${cfCurrency(s.win)}</td><td>${percentBox(
        s.portfolioPc
      )}</td><td>${s.portfolio}</td></tr>`
  );
  $("steps").innerHTML = `<table>
    <thead>${header}</thead>
    <tbody>${steps.join("")}</tbody>
  </table>`;
  $("summary").innerHTML = data.summary;
  $("footer-summary").innerHTML = data.footerSummary;
};

const setup = () => {
  $("marbles").innerHTML = marblesInfo();
};
