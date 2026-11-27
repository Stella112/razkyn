import React from 'react'
import { Composition } from 'remotion'
import { Razkyn } from './Video'
import tl from './timeline.json'
export const RemotionRoot: React.FC = () => <Composition id="Razkyn" component={Razkyn} durationInFrames={tl.total} fps={tl.fps} width={1920} height={1080} />
