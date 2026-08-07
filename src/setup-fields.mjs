import { ensureTableFields } from "./feishu/setup.mjs";
import {
  COLLECTION_FIELD_DEFINITIONS,
  INPUT_FIELD_NAME,
} from "./feishu/schema.mjs";

ensureTableFields(COLLECTION_FIELD_DEFINITIONS, {
  renameOnlyFieldTo: INPUT_FIELD_NAME,
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
