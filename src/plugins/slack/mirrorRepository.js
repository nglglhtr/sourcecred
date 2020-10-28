// @flow

import type Database from "better-sqlite3";
import stringify from "json-stable-stringify";
import * as Model from "./models";
import dedent from "../../util/dedent";

// The version should be bumped any time the database schema is changed,
const VERSION = "slack_mirror_v0";

/**
 * An interface for reading the local Slack data
 */
export class SqliteMirrorRepository {
  +_db: Database;
  
  constructor(db: Database, token: Model.SlackToken) {
    if (db == null) throw new Error ("db: " + String(db));
    this._db = db;
    this._transaction(() => {
      this._initialize(token);
    });
  }

  _transaction(queries: () => void) {
    const db = this._db;
    if (db.inTransaction) {
      throw new Error ("already in transaction");
    }
    try {
      db.prepare("BEGIN").run();
      queries();
      if (db.inTransaction) {
        db.prepare("COMMIT").run();
      }
    } finally {
      if (db.inTransaction) {
        db.prepare("ROLLBACK").run();
      }
    }
  }

  _initialize(token: Model.SlackToken) {
    const db = this._db;
    // We store the config in a singleton table `meta`, whose unique row
    // has primary key `0`. Only the first ever insert will succeed; we
    // are locked into the first config.
    db.prepare(
      dedent`\
        CREATE TABLE IF NOT EXISTS meta (
            zero INTEGER PRIMARY KEY,
            config TEXT NOT NULL
        )
      `
    ).run();

    const config = stringify({
      version: VERSION
    });

    const existingConfig: string | void = db
      .prepare("SELECT config FROM meta")
      .pluck()
      .get();
    if (existingConfig === config) {
      // Already set up; nothing to do.
      return;
    } else if (existingConfig !== undefined) {
      throw new Error(
        "Database already populated with incompatible server or version"
      );
    }
    db.prepare("INSERT INTO meta (zero, config) VALUES (0, ?)").run(config);
    
    /**
     * All rows within sqlite tables have a 64 bit signed integer key
     * that uniquely identifies the row within the table (`rowid`) 
     * https://www.sqlite.org/lang_createtable.html#rowid
     */

    const tables = [
      dedent `\
        CREATE TABLE channels (
          channel_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL
        )
      `,
      dedent `\
        CREATE TABLE members (
          user_id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT NOT NULL
        )
      `,
      dedent `\
        CREATE TABLE messages (
          channel_id TEXT NOT NULL,
          timestamp_ms TEXT NOT NULL,
          author_id TEXT NOT NULL,
          message_body TEXT,
          thread BOOLEAN,
          in_reply_to TEXT,
          CONSTRAINT value_object PRIMARY KEY (channel_id, timestamp_ms),
          FOREIGN KEY(author_id) REFERENCES members(user_id)
        )
      `,
      dedent `\
        CREATE TABLE message_reactions (
          message_id TEXT NOT NULL,
          reaction_name TEXT,
          reactor TEXT,
          FOREIGN KEY (message_id) REFERENCES messages(value_object),
          FOREIGN KEY (reactor) REFERENCES members(user_id)
        )
      `,
      dedent `\
        CREATE TABLE message_mentions (
          message_id TEXT NOT NULL,
          mentioned_user_id TEXT NOT NULL,
          FOREIGN KEY (message_id) REFERENCES messages(value_object)
        )
      `
    ];

    for (const table of tables) {
      db.prepare(table).run();
    }
  }

}
