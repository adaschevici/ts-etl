export const escapeHtml = (unsafe: string): string => {
  if (typeof unsafe !== 'string') {
    return String(unsafe); // Coerce to string if not already
  }
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const condenseHtml = (htmlString: string): string => {
  if (typeof htmlString !== 'string') {
    return ''; // Or throw an error, depending on desired behavior
  }

  let condensed = htmlString;

  // 1. Remove whitespace between tags. THIS IS THE KEY STEP FOR YOUR REQUEST.
  // Example: <td>R2C4</td> <td>R2C5</td> -> <td>R2C4</td><td>R2C5</td>
  // Example: </div>   <p> -> </div><p>
  condensed = condensed.replace(/>\s+</g, '><');

  // 2. Replace multiple whitespace characters (including newlines, tabs)
  // within text content or between attributes with a single space.
  // Example: <p>Hello   World</p> -> <p>Hello World</p>
  // Example: <div class="foo   bar"> -> <div class="foo bar">
  condensed = condensed.replace(/\s\s+/g, ' ');

  // 3. Trim leading/trailing whitespace from the entire string.
  condensed = condensed.trim();

  // 4. Optional: Remove leading/trailing whitespace inside tags around content.
  // This regex targets content between > and <, trims it, and reassembles.
  // Example: <td>  Content  </td> -> <td>Content</td>
  condensed = condensed.replace(/>\s+(.+?)\s+</g, (match, group1) => {
    // Ensure that the replacement itself doesn't re-introduce spaces between tags
    // if group1.trim() is empty. However, the first rule (/>\s+</g) should
    // have already handled most cases of empty content between tags if there was whitespace.
    // If group1.trim() results in an empty string, it means the content was only whitespace.
    // In that case, `><` is the desired output, already handled by rule 1.
    // If group1.trim() is not empty, then we put the trimmed content back.
    const trimmedContent = group1.trim();
    if (trimmedContent) {
      return `>${trimmedContent}<`;
    }
    // If content was only whitespace, rule 1 (/>\s+</g, '><') should have already
    // collapsed `>   <` to `><`. This rule is more for `>  content  <`.
    // If after trimming, group1 is empty, it means the original content was only whitespace.
    // The first rule `/>\s+</g` would have already converted `>   <` to `><`.
    // This rule, when `group1.trim()` is empty, effectively does the same for `>\s+<` if rule 1 somehow missed it
    // or if the structure was slightly different.
    // However, for `>\s+<` (no content), rule 1 is more direct.
    // This rule is primarily for `> whitespace CONTENT whitespace <`.
    return `>${trimmedContent}<`; // If trimmedContent is empty, this becomes `><`
  });

  return condensed;
};
