// @flow

import {escape} from "entities";
import {type WeightedGraph as WeightedGraphT} from "../../core/weightedGraph";
import {empty as emptyWeights} from "../../core/weights";
import {
  Graph,
  NodeAddress,
  EdgeAddress,
  type Node,
  type Edge,
  type NodeAddressT,
  type EdgeAddressT,
} from "../../core/graph";
import {SqliteMirrorRepository} from "./mirrorRepository";
import {
  memberNodeType, messageNodeType, reactionNodeType, authorsMessageEdgeType, addsReactionEdgeType, reactsToEdgeType, mentionsEdgeType, messageRepliesEdgeType
} from "./declaration.js";
import * as Model from "./models.js"
import {type WeightConfig, reactionWeight} from "./reactionWeights";

const MESSAGE_LENGTH = 30;

//----------------------
/**
 * Addresses
 */
//----------------------

export function userAddress(userId: Buffer): NodeAddressT {
  return NodeAddress.append(memberNodeType.prefix, "user", userId);
}

export function memberAddress(member: Model.User): NodeAddressT {
  return NodeAddress.append(
    memberNodeType.prefix,
    member.email
  );
}

function messageAddress(message: Model.Message): NodeAddressT {
  return NodeAddress.append(
    messageNodeType.prefix,
    message.channel,
    message.id
  );
}

function reactionAddress(reaction: string, message: Model.Message): NodeAddressT {
  // Hacky order, so we can boost categories.
  return NodeAddress.append(
    reactionNodeType.prefix,
    message.channel,
    reaction,
    message.authorId,
    message.id
  );
}


//----------------------
/**
 * Nodes
 */
//----------------------

function memberNode(member: Model.User): Node {
  const description = `slack/#${escape(member.id.slice(0, 20))}`;
  return {
    address: memberAddress(member),
    description,
    timestampMs: null,
  };
}

function messageNode(
  message: Model.Message,
  channelName: string
): Node {
  // const url = messageUrl(guild, message.channelId, message.id);
  const partialMessage = escape(message.text.substring(0, MESSAGE_LENGTH));
  const description = `#${channelName} message ["${partialMessage}..."]`;
  return {
    address: messageAddress(message),
    description,
    timestampMs: Number(parseFloat(message.id) * 1000),
  };
}

function reactionNode(
  message: Model.Message,
  reaction: string
): Node {
  // const msgUrl = messageUrl(guild, reaction.channelId, reaction.messageId);
  const reactionStr = reaction
  const description = `Reacted \`${reactionStr}\` to message [${message.id}] in channel ${message.channel}`;
  return {
    address: reactionAddress(reaction, message),
    description,
    timestampMs: Number(parseFloat(message.id) * 1000)
  };
}

//----------------------
/**
 * Edges
 */
//----------------------

function authorsMessageEdge(
  message: Model.Message,
  author: Model.User
): Edge {
  const address: EdgeAddressT = EdgeAddress.append(
    authorsMessageEdgeType.prefix,
    String(author.id),
    message.channel,
    message.id
  );
  return {
    address,
    timestampMs: Number(parseFloat(message.id) * 1000),
    src: memberAddress(author),
    dst: messageAddress(message),
  };
}

function addsReactionEdge(
  reaction: string,
  member: Model.User,
  message: Model.Message
): Edge {
  const address: EdgeAddressT = EdgeAddress.append(
    addsReactionEdgeType.prefix,
    String(member.id),
    reaction,
    message.channel,
    message.id
  );
  return {
    address,
    // TODO: for now using timestamp of the message,
    // as reactions don't have timestamps.
    timestampMs: Number(parseFloat(message.id) * 1000),
    src: memberAddress(member),
    dst: reactionAddress(reaction, message),
  };
}

function reactsToEdge(reaction: string, message: Model.Message): Edge {
  const address: EdgeAddressT = EdgeAddress.append(
    reactsToEdgeType.prefix,
    reaction,
    String(message.authorId),
    message.channel,
    message.id
  );
  return {
    address,
    // TODO: for now using timestamp of the message,
    // as reactions don't have timestamps.
    timestampMs: Number(parseFloat(message.id) * 1000),
    src: reactionAddress(reaction, message),
    dst: messageAddress(message),
  };
}

function mentionsEdge(message: Model.Message, member: Model.User): Edge {
  const address: EdgeAddressT = EdgeAddress.append(
    mentionsEdgeType.prefix,
    message.channel,
    String(message.authorId),
    message.id,
    String(member.id)
  );
  return {
    address,
    timestampMs: Number(parseFloat(message.id) * 1000),
    src: messageAddress(message),
    dst: memberAddress(member),
  };
}

function repliesEdge(message: Model.Message, reply: Model.Message): Edge {
  const address: EdgeAddressT = EdgeAddress.append(
    messageRepliesEdgeType.prefix,
    message.channel,
    String(message.authorId),
    message.id,
    reply.channel,
    String(reply.authorId),
    reply.id
  );
  return {
    address,
    timestampMs: Number(parseFloat(message.id) * 1000),
    src: messageAddress(message),
    dst: messageAddress(reply)
  };
}

export function createGraph(
  token: Model.SlackToken,
  repo: SqliteMirrorRepository,
  weights: WeightConfig
): WeightedGraphT {
  const wg = {
    graph: new Graph(),
    weights: emptyWeights(),
  };
  // create a member map from fetched members
  const memberMap = new Map(repo.members().map((m) => [m.id, m]));
  //fetch all channels (conversations)
  const channels = repo.channels();
  for (const channel of channels) {
    // fetch all messages of the channel
    const messages = repo.messages(channel.id);
    for (const message of messages) {
      // if a message does not have reactions and mentions continue
      // only the messages which have a reaction
      if (!message.hasReactions && !message.hasMentions) continue;

      let hasEdges = false;
      const reactions = repo.reactions(message.channel, message.id);

      // add reaction nodes & edges
      for (const reaction of reactions) {
        const reactingMember = memberMap.get(reaction.reactor);
        if (!reactingMember) continue;

        const node = reactionNode(message, reaction);
        wg.weights.nodeWeights.set(
          node.address,
          reactionWeight(weights, reaction.reaction, reaction.reactor, message.authorId, message.channel)
        );

        wg.graph.addNode(node);
        wg.graph.addNode(memberNode(reactingMember));
        wg.graph.addEdge(reactsToEdge(reaction.reaction, message));
        wg.graph.addEdge(addsReactionEdge(reaction.reaction, reactingMember, message));
        hasEdges = true;
      }

      // add message mentions nodes & edges
      for (const user of message.mentions) {
        const mentionedMember = memberMap.get(user);
        if (!mentionedMember) continue;
        wg.graph.addNode(memberNode(mentionedMember));
        wg.graph.addEdge(mentionsEdge(message, mentionedMember));
        hasEdges = true;
      }

      // message is a thread starter
      if (message.isThread && message.inReplyTo === message.id) {
        const allReplies = repo.thread(message.id);
        wg.graph.addNode(messageNode(message, channel.name));
        for (const replyId of allReplies) {
          const replyMessage = repo.message(replyId);
          wg.graph.addNode(messageNode(replyMessage, channel.name));
          wg.graph.addEdge(repliesEdge(message, replyMessage));
        }
      }

      // Don't bloat the graph with isolated messages.
      if (hasEdges) {
        const author = memberMap.get(message.authorId);
        if (!author) continue;
        wg.graph.addNode(memberNode(author));
        wg.graph.addNode(messageNode(message, channel.name));
        wg.graph.addEdge(authorsMessageEdge(message, author));
      }

    }
  }
  return wg;
}
