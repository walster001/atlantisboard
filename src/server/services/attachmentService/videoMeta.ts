import {
  buildVideoAttachmentQualityMeta,
  type VideoAttachmentQualityMeta,
  type VideoRenditionHeight,
} from '../../../shared/videoQuality.js';
import { buildVideoAbrStreamingMeta } from './videoAbrTranscode.js';
import { isVideoAbrEligible } from './videoAbrEligibility.js';
import { probeVideoSourceHeight } from './videoProbe.js';

export async function resolveVideoQualityMeta(args: {
  readonly attachmentId: string;
  readonly attachment: { readonly videoSourceHeight?: number | null | undefined };
  readonly objectName: string;
  readonly sourceHeight: number | null;
}): Promise<VideoAttachmentQualityMeta> {
  const abrEnabled = isVideoAbrEligible();
  const streaming = abrEnabled
    ? await buildVideoAbrStreamingMeta({
        attachmentId: args.attachmentId,
        sourceObjectName: args.objectName,
        sourceHeight: args.sourceHeight,
      })
    : {
        ready: false,
        hlsManifestUrl: null,
        dashManifestUrl: null,
        renditionHeights: [] as readonly VideoRenditionHeight[],
      };
  return buildVideoAttachmentQualityMeta({
    sourceHeight: args.sourceHeight ?? args.attachment.videoSourceHeight,
    streaming,
    abrEnabled,
  });
}

export async function ensureVideoSourceHeightOnAttachment(args: {
  readonly attachment: { readonly videoSourceHeight?: number | null | undefined; readonly url: string };
  readonly objectName: string;
}): Promise<number | null> {
  if (args.attachment.videoSourceHeight != null && Number.isFinite(args.attachment.videoSourceHeight)) {
    return args.attachment.videoSourceHeight;
  }
  return probeVideoSourceHeight(args.objectName);
}
