import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../../config/index.js";

function isImage(data) {
  return hasExtension(data, IMAGE_EXTENSIONS);
}

function isVideo(data) {
  return hasExtension(data, VIDEO_EXTENSIONS);
}

function isOtherBinary(data) {
  // Here, we're just checking if the file is larger than 1MB as an example.
  // You can add more conditions or adjust as necessary.
  return data.type === "file" && data.size > 1000000;
}

function hasExtension(data, extensions) {
  if (!extensions) {
    return false;
  }

  if (!data || !data.name) {
    return false;
  }

  return (
    data.type === "file" &&
    extensions.some((ext) => data.name.toLowerCase().endsWith(ext))
  );
}

export { isImage, isVideo, isOtherBinary };
