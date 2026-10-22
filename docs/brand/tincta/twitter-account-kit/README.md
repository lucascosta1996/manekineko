# Tincta — four X / Twitter account PFP kits

| Folder | Artwork |
| --- | --- |
| [tinctaxyz](tinctaxyz/) | Main Tincta TC Ligature glyph |
| [tinctarewards](tinctarewards/) | Approved Open artwork |
| [tinctamorph](tinctamorph/) | Existing Morph artwork from the landing page |
| [tinctaassembly](tinctaassembly/) | Existing Assembly artwork from the landing page |

Each account folder contains (ACCOUNT is the account handle):

- ACCOUNT-pfp-400.png — profile upload file.
- ACCOUNT-pfp-1024.png — larger PNG export.
- ACCOUNT-pfp.svg — editable, scalable vector with the identical framing.

Use the PNG to upload a profile picture. All files have an opaque white square canvas and space for a circular crop. Preserve the square framing: do not crop tightly around the artwork. The parent account uses the main glyph, not the wordmark or Rewards artwork.

The Rewards exports match the approved PFP kit byte for byte. Morph and Assembly are rendered from the actual landing-page component, with their existing catalog colors and geometry; only the outer square framing changes. Their source artwork has not been redesigned.

Open preview.png for the four accounts together with 32, 48 and 96 px circular examples. This preview is a review sheet, not a profile upload. manifest.json records source paths, PNG sizes, hashes and circular-crop checks.

Regenerate from the repository root:

    node --import tsx scripts/generate-twitter-account-kit.mjs
    node --import tsx scripts/generate-twitter-account-kit.mjs --check

No X accounts have been changed by this export.
