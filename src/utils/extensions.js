import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../../config/index.js";

/**
 * Checks if the given data has an image extension.
 *
 * @param {Object} data - The data to check.
 * @returns {boolean} `true` if the data has an image extension, otherwise `false`.
 */
function isImage(data) {
  return hasExtension(data, IMAGE_EXTENSIONS);
}

/**
 * Checks if the given data has a video extension.
 *
 * @param {Object} data - The data to check.
 * @returns {boolean} `true` if the data has a video extension, otherwise `false`.
 */
function isVideo(data) {
  return hasExtension(data, VIDEO_EXTENSIONS);
}

/**
 * Checks if the given data is a binary file (based on size, as an example).
 *
 * @param {Object} data - The data to check.
 * @returns {boolean} `true` if the data is considered a binary file, otherwise `false`.
 */
function isOtherBinary(data) {
  // Here, we're just checking if the file is larger than 1MB as an example.
  // You can add more conditions or adjust as necessary.
  return data.type === "file" && data.size > 1000000;
}

/**
 * Checks if the given data has any of the provided extensions.
 *
 * @param {Object} data - The data to check.
 * @param {string[]} extensions - The list of extensions to check against.
 * @returns {boolean} `true` if the data has any of the provided extensions, otherwise `false`.
 */
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
