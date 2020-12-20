// @flow

import type {Plugin} from "./plugin";
import {GithubPlugin} from "../plugins/github/plugin";
import {DiscoursePlugin} from "../plugins/discourse/plugin";
import {DiscordPlugin} from "../plugins/experimental-discord/plugin";
import {SlackPlugin} from "../plugins/slack/plugin";
import {InitiativesPlugin} from "../plugins/initiatives/plugin";

/**
 * Returns an object mapping owner-name pairs to CLI plugin
 * declarations; keys are like `sourcecred/github`.
 */
// TODO(@decentralion): Fix the type signature here.
export function bundledPlugins(): {[pluginId: string]: Plugin} {
  return {
    "sourcecred/github": new GithubPlugin(),
    "sourcecred/discourse": new DiscoursePlugin(),
    "sourcecred/discord": new DiscordPlugin(),
    "sourcecred/initiatives": new InitiativesPlugin(),
    "sourcecred/slack": new SlackPlugin(),
  };
}
