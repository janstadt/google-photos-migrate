import { WriteTags } from 'exiftool-vendored';
import { MediaFile } from '../media/MediaFile';
import { exhaustiveCheck } from '../ts';
import { MetaType } from './MetaType';
import { readFile } from 'fs/promises';
import { GoogleMetadata } from './GoogleMeta';
import {
  ApplyMetaError,
  ExifToolError,
  MissingMetaError,
  WrongExtensionError,
} from './apply-meta-errors';
import { MigrationContext } from '../media/migrate-google-dir';

export async function applyMetaFile(
  mediaFile: MediaFile,
  migCtx: MigrationContext
): Promise<ApplyMetaError | null> {
  const metaJson = (await readFile(mediaFile.jsonPath)).toString();
  const meta: GoogleMetadata | undefined = JSON.parse(metaJson);

  const timeTakenTimestamp = meta?.photoTakenTime?.timestamp;
  if (timeTakenTimestamp === undefined)
    return new MissingMetaError(mediaFile, 'photoTakenTime');
  const timeTaken = new Date(parseInt(timeTakenTimestamp) * 1000);
  // always UTC as per https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
  const timeTakenUTC = timeTaken.toISOString();

  const tags: WriteTags = {};

  switch (mediaFile.ext.metaType) {
    case MetaType.EXIF:
      tags.SubSecDateTimeOriginal = timeTakenUTC;
      tags.SubSecCreateDate = timeTakenUTC;
      tags.SubSecModifyDate = timeTakenUTC;
      break;
    case MetaType.QUICKTIME:
      tags.DateTimeOriginal = timeTakenUTC;
      tags.CreateDate = timeTakenUTC;
      tags.ModifyDate = timeTakenUTC;
      tags.TrackCreateDate = timeTakenUTC;
      tags.TrackModifyDate = timeTakenUTC;
      tags.MediaCreateDate = timeTakenUTC;
      tags.MediaModifyDate = timeTakenUTC;
      break;
    case MetaType.NONE:
      break;
    default:
      exhaustiveCheck(mediaFile.ext.metaType);
  }

  tags.FileModifyDate = timeTakenUTC;

  try {
    await migCtx.exiftool.write(mediaFile.path, tags, [
      '-overwrite_original',
      '-api',
      'quicktimeutc',
    ]);
  } catch (e) {
    if (e instanceof Error) {
      const wrongExtMatch = e.message.match(
        /Not a valid (?<expected>\w+) \(looks more like a (?<actual>\w+)\)/
      );
      const expected = wrongExtMatch?.groups?.['expected'];
      const actual = wrongExtMatch?.groups?.['actual'];
      if (expected !== undefined && actual !== undefined) {
        return new WrongExtensionError(
          mediaFile,
          `.${expected.toLowerCase()}`,
          `.${actual.toLowerCase()}`
        );
      }
      return new ExifToolError(mediaFile, e);
    }
    return new ExifToolError(mediaFile, new Error(`${e}`));
  }

  return null;
}
