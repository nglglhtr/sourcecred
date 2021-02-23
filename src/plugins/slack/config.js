//@flow

import * as NullUtil from "../../util/null";
import * as C from "../../util/combo";
import * as Model from "./models";
import {
  type EmojiWeightConfig,
  type ChannelWeightConfig,
  type WeightConfig,
} from "./reactionWeights";

export type SlackConfigJson = {|
  +name: string,
  +reactionWeightConfig: EmojiWeightConfig,
  +channelWeightConfig?: ChannelWeightConfig
|}

const parserJson: C.Parser<SlackConfigJson> = C.object(
  {
    name: C.string,
    reactionWeightConfig: C.object({
      defaultWeight: C.number,
      weights: C.dict(C.number),
    }),
  },
  {
    channelWeightConfig: C.object({
      defaultWeight: C.number,
      weights: C.dict(C.number),
    }),
  }
);

export type SlackConfig = {|
  +name: string,
  +weights: WeightConfig,
|};

export function _upgrade(json: SlackConfigJson): SlackConfig {
  const defaultChannelWeights = {defaultWeight: 1, weights: {}};
  const defaultEmojiWeights = {defaultWeight: 1, weights: {}};
  return {
    name: json.name,
    weights: {
      channelWeights: NullUtil.orElse(
        json.channelWeightConfig,
        defaultChannelWeights
      ),
      emojiWeights: NullUtil.orElse(
        json.reactionWeightConfig,
        defaultEmojiWeights
      ),
    }
  };
}

export const parser: C.Parser<SlackConfig> = C.fmap(parserJson, _upgrade);
