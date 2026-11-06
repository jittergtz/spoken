const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let directory;
require.cache[require.resolve("electron")] = {
  exports: {
    app: { getPath: () => directory, getAppPath: () => process.cwd(), isReady: () => false },
  },
};
const DatabaseManager = require("../../src/helpers/database");

test("grammar history persists independently of dictation and supports deletion and retention", (t) => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spoken-grammar-history-"));
  let manager;
  t.after(() => {
    manager?.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const Database = require("better-sqlite3");
  try {
    const probe = new Database(":memory:");
    probe.close();
  } catch (error) {
    if (/NODE_MODULE_VERSION|Could not locate the bindings file/.test(error.message)) {
      t.skip("better-sqlite3 is built for a different runtime");
      return;
    }
    throw error;
  }

  manager = new DatabaseManager();
  const speech = manager.saveTranscription("Existing dictation");
  const first = manager.saveGrammarCorrection({
    text: "I wrote an email.",
    raw_text: "I writed an email.",
    model: "test-model",
    outcome: "applied",
  });
  const second = manager.saveGrammarCorrection({
    text: "She goes home.",
    raw_text: "She go home.",
    model: "test-model",
    outcome: "changed",
  });
  assert.deepEqual(
    manager.getGrammarHistory().map((item) => item.id),
    [second.id, first.id]
  );
  assert.equal(manager.getTranscriptions().length, 1);
  assert.equal(manager.getGrammarHistory(1)[0].outcome, "changed");

  manager.db.close();
  manager = new DatabaseManager();
  assert.equal(manager.getGrammarHistory().length, 2);
  assert.equal(manager.getGrammarHistory()[1].raw_text, "I writed an email.");
  manager.db
    .prepare("UPDATE grammar_corrections SET timestamp = datetime('now', '-2 days') WHERE id = ?")
    .run(first.id);
  assert.equal(manager.deleteGrammarHistoryExpiredBefore(1), 1);
  assert.equal(manager.getGrammarHistory().length, 1);
  assert.equal(manager.deleteGrammarHistoryItem(second.id).deleted, 1);
  manager.saveGrammarCorrection({
    text: "Fine.",
    raw_text: "Fine.",
    model: "test-model",
    outcome: "unchanged",
  });
  assert.equal(manager.clearGrammarHistory().cleared, 1);
  assert.deepEqual(manager.getGrammarHistory(), []);
  assert.equal(manager.getTranscriptions()[0].id, speech.id);
});
