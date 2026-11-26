/* People's names are masked before free text reaches the AI provider (lib/pii.ts; 24 Nov 2026, security task S6),
 * and the corridor's place names are not. Run: npx tsx --test tests/unit/*.test.ts */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { maskNames, maskPersonalDetails, maskStringsDeep } from "../../src/lib/pii.js";

const m = (t: string) => maskPersonalDetails(t).text;

test("a name after a self-introduction is masked, in Taglish and English, capitalised or not", () => {
  assert.equal(m("ako si Juan Dela Cruz, isara ang lane 2"), "ako si [name], isara ang lane 2");
  assert.equal(m("ako po si Maria Santos"), "ako po si [name]");
  assert.equal(m("ako si juan dela cruz isara lane 2"), "ako si [name] isara lane 2");
  assert.equal(m("my name is Maria Santos and close lane 3 SB"), "my name is [name] and close lane 3 SB");
  assert.equal(m("My name is pedro penduko"), "My name is [name]");
  assert.equal(m("I'm Juan from Valenzuela"), "I'm [name] from Valenzuela");
});

test("a name after a role word is masked", () => {
  assert.equal(m("driver Juan Santos stalled at km 20"), "driver [name] stalled at km 20");
  assert.equal(m("the driver, Juan Santos, is hurt"), "the driver, [name], is hurt");
  assert.equal(m("victim Ana Liza Cruz-Reyes is at Bocaue"), "victim [name] is at Bocaue");
  assert.equal(m("Name: Rosa Mendoza"), "Name: [name]");
});

test("a name after an honorific is masked", () => {
  assert.equal(m("Engr. Reyes says close lane 1"), "Engr. [name] says close lane 1");
  assert.equal(m("Ma'am Lourdes de los Santos called"), "Ma'am [name] called");
  assert.equal(m("Sir Ben asked to close lane 2"), "Sir [name] asked to close lane 2");
  assert.equal(m("Atty. Ramon Bautista"), "Atty. [name]");
  assert.equal(m("Dr. Cruz is on site"), "Dr. [name] is on site");
  assert.equal(m("Mrs. Garcia"), "Mrs. [name]");
  assert.ok(m("Mr. Jose P. Rizal Jr. reported a crash at Bocaue").startsWith("Mr. [name]"));
  assert.ok(!m("Mr. Jose P. Rizal Jr. reported a crash at Bocaue").includes("Rizal"));
});

test("si / ni / kay + a capitalised name is masked (Taglish)", () => {
  assert.equal(m("si Juan ay nasa San Fernando"), "si [name] ay nasa San Fernando");
  assert.equal(m("sasakyan ni Pedro sa Meycauayan toll"), "sasakyan ni [name] sa Meycauayan toll");
  assert.equal(m("tawagan si Mang Tomas"), "tawagan si [name]");
  assert.equal(m("ayon kay Kapitan Ramon Bautista"), "ayon kay [name]");
});

test("place names survive, even right after a cue word", () => {
  const places = [
    "San Fernando", "Sta. Rita", "Santa Rita", "Balintawak", "Bocaue", "Meycauayan", "Marilao", "Tabang", "Guiguinto",
    "Mexico", "Angeles", "Dau", "Mabalacat", "Valenzuela", "Karuhatan", "Lawang Bato", "Smart Connect",
    "Philippine Arena", "Ciudad de Victoria", "Harbor Link", "SCTEX", "San Simon", "Pulilan", "Balagtas",
    "Tambubong", "Sta. Ines", "Paso de Blas", "Mabiga", "Petron Marilao",
  ];
  for (const p of places) {
    for (const t of [`close lane 2 at ${p}`, `kay ${p} papuntang Maynila`, `si ${p}`, `sa ${p} NB`, `driver ${p} exit`, `called ${p}`]) {
      assert.equal(maskNames(t).text, t, `${t} -> ${maskNames(t).text}`);
    }
  }
  assert.equal(m("Gov. Halili Avenue exit"), "Gov. Halili Avenue exit");
  assert.equal(m("Mayor Jose Abad Santos Avenue is closed"), "Mayor Jose Abad Santos Avenue is closed");
  assert.equal(m("officer In Charge at Balintawak"), "officer In Charge at Balintawak");
  assert.equal(m("we ate Lunch at Petron"), "we ate Lunch at Petron");
});

test("no command the sandbox is tested with is changed by name masking (false positives)", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  let seen = 0;
  for (const f of ["../../scripts/sandbox-command-eval.ts", "../../scripts/sandbox-command-check.ts", "../../scripts/sandbox-command-context.ts"]) {
    const src = readFileSync(here + f, "utf8");
    for (const hit of src.matchAll(/"([^"\n]{3,300})"/g)) {
      seen++;
      const out = maskNames(hit[1]);
      assert.equal(out.masked, 0, `${f}: ${JSON.stringify(hit[1])} -> ${JSON.stringify(out.text)}`);
    }
  }
  assert.ok(seen > 500, `only ${seen} strings were read`);
});

test("the other masks still work alongside names", () => {
  assert.equal(
    m("victim Ana Cruz, plate ABC 1234, 0917 123 4567, ana@x.com"),
    "victim [name], plate [plate], [phone], [email]",
  );
  assert.equal(m("set 1500 NB and 2000 VPH at 80 KPH"), "set 1500 NB and 2000 VPH at 80 KPH");
  assert.equal(maskPersonalDetails("driver Juan Santos").masked, 1);
});

test("maskStringsDeep masks strings only and keeps numbers and shape", () => {
  const input = { cardTitle: "Ranking", rows: [{ label: "Bocaue", value: 1234 }, { label: "driver Juan Santos", value: 7 }], ok: true, n: null };
  const out = maskStringsDeep(input);
  assert.deepEqual(out, { cardTitle: "Ranking", rows: [{ label: "Bocaue", value: 1234 }, { label: "driver [name]", value: 7 }], ok: true, n: null });
  assert.equal(input.rows[1].label, "driver Juan Santos", "the input object is not modified");
});
