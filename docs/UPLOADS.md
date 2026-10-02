# Optional image uploads

The primary deployment runs without R2. Add an R2 bucket to enable avatars, profile covers, and image attachments. Supported image uploads are limited to 3 MB per file, with member and installation usage controls in the app.

## Activate storage

Activate R2 in your Cloudflare account and create a bucket, for example `extb-uploads`. R2 activation can require billing details even when storage and operations remain within the free allowance. Review [R2 setup](https://developers.cloudflare.com/r2/get-started/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) before activation.

## Preserve your installation

The optional `wrangler.uploads.toml` is a complete configuration example. Before using it, copy these values from your deployed installation:

- Worker `name`
- D1 `database_name` and `database_id`, keeping the binding `DB`
- Existing `CHAT_ROOM` and `PASSWORD_HASHER` bindings, classes, and migration history
- Custom domains and configured public variables, if present

Set the R2 `bucket_name` to your bucket, keeping the binding `MEDIA`. Never deploy the optional example with a new database or a different Worker name unless you intend to create another installation.

In Cloudflare's connected repository, commit that configuration and change the deployment command to `npm run deploy:uploads`. You can also deploy from a local checkout:

```sh
npm run verify
npm run deploy:uploads
```

Your existing secrets remain attached to the same Worker. Existing members, posts, and chat rooms stay in the same resources. Confirm an image uploads and renders after the deployment.

No Cloudflare Images subscription is required. Without an `IMAGES` binding, the app serves original images. Optional image transformations can be configured separately with an Images binding and its applicable account plan.

Back up both the D1 database and R2 objects. They contain different parts of your community's data.
