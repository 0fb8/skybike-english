// 変化形から、単語表の見出し語（原形）の候補を作る。
// 品詞や文脈は見ないので、候補を多めに出して単語表にあるものを使う（例: "stopped" → stop / stopp / stoppe …）。

/** 規則どおりに変化しない形 → 原形 */
const IRREGULAR: Record<string, string> = Object.fromEntries(
  `be:am,is,are,was,were,been,being
have:has,had,having
do:does,did,done,doing
go:goes,went,gone
say:said
make:made
get:got,gotten
know:knew,known
think:thought
take:took,taken
see:saw,seen
come:came
give:gave,given
find:found
tell:told
become:became
leave:left
feel:felt
bring:brought
begin:began,begun
keep:kept
hold:held
write:wrote,written
stand:stood
hear:heard
let:lets
mean:meant
meet:met
run:ran
pay:paid
sit:sat
speak:spoke,spoken
lie:lay,lain,lying
lead:led
grow:grew,grown
lose:lost
fall:fell,fallen
send:sent
build:built
understand:understood
draw:drew,drawn
break:broke,broken
spend:spent
rise:rose,risen
drive:drove,driven
buy:bought
wear:wore,worn
choose:chose,chosen
seek:sought
throw:threw,thrown
catch:caught
deal:dealt
win:won
forget:forgot,forgotten
sell:sold
fight:fought
teach:taught
eat:ate,eaten
sing:sang,sung
drink:drank,drunk
swim:swam,swum
fly:flew,flown
ride:rode,ridden
hide:hid,hidden
shake:shook,shaken
steal:stole,stolen
freeze:froze,frozen
forgive:forgave,forgiven
bite:bit,bitten
feed:fed
flee:fled
bend:bent
lend:lent
light:lit
sleep:slept
sweep:swept
weep:wept
dig:dug
hang:hung
stick:stuck
strike:struck
swing:swung
shoot:shot
shine:shone
bear:bore,born,borne
tear:tore,torn
swear:swore,sworn
wake:woke,woken
arise:arose,arisen
withdraw:withdrew,withdrawn
undertake:undertook,undertaken
overcome:overcame
mistake:mistook,mistaken
foresee:foresaw,foreseen
undergo:underwent,undergone
can:could
will:would
shall:should
may:might
child:children
person:people
man:men
woman:women
foot:feet
tooth:teeth
mouse:mice
analysis:analyses
crisis:crises
criterion:criteria
phenomenon:phenomena
good:better,best
bad:worse,worst
far:further,furthest,farther,farthest
much:more,most
little:less,least`
    .split("\n")
    .flatMap((line) => {
      const [base, forms] = line.split(":");
      return forms.split(",").map((f) => [f, base]);
    }),
);

const VOWEL = /[aeiou]/;

/**
 * 原形の候補（易しい判定から順。最初の要素は語そのもの）。
 * derivations: false なら変化形（複数形・過去形・-ing・比較級）だけで、副詞 → 形容詞（-ly）はたどらない
 */
export function baseCandidates(word: string, { derivations = true }: { derivations?: boolean } = {}): string[] {
  const w = word.toLowerCase();
  const out = [w];
  const add = (s: string) => { if (s.length >= 2 && !out.includes(s)) out.push(s); };
  if (IRREGULAR[w]) add(IRREGULAR[w]);

  // 語尾を取って、そのまま / e を足す / 重ねた子音を戻す / i を y に戻す
  const stem = (suffix: string) => {
    if (!w.endsWith(suffix) || w.length <= suffix.length + 1) return;
    const s = w.slice(0, -suffix.length);
    add(s);
    add(s + "e");
    if (s.length >= 3 && s.at(-1) === s.at(-2) && !VOWEL.test(s.at(-1)!)) add(s.slice(0, -1));
    if (s.endsWith("i")) add(s.slice(0, -1) + "y");
  };
  for (const suffix of ["ing", "ed", "es", "s", "est", "er"]) stem(suffix);
  // 副詞 → 形容詞（quickly → quick、happily → happy、gently → gentle）
  if (derivations && w.endsWith("ly") && w.length > 4) {
    const s = w.slice(0, -2);
    add(s);
    if (s.endsWith("i")) add(s.slice(0, -1) + "y");
    add(s + "le");
    if (w.endsWith("ally")) add(w.slice(0, -4)); // basically → basic
  }
  return out;
}
