import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.argv[2];
const minAppVersion = process.argv[3];

// read minAppVersion from manifest.json if not provided
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion: currentMinAppVersion } = manifest;

// update manifest.json
if (targetVersion) {
	manifest.version = targetVersion;
	if (minAppVersion) {
		manifest.minAppVersion = minAppVersion;
	}
	writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));
}

// update versions.json (if it exists)
try {
	let versions = JSON.parse(readFileSync("versions.json", "utf8"));
	if (targetVersion && minAppVersion) {
		versions[targetVersion] = minAppVersion;
		writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
	}
} catch (e) {
	console.log("versions.json not found or invalid. Creating it now...");
	if (targetVersion && minAppVersion || targetVersion && currentMinAppVersion) {
		writeFileSync(
			"versions.json",
			JSON.stringify(
				{
					[targetVersion]: minAppVersion || currentMinAppVersion,
				},
				null,
				"\t"
			)
		);
	}
}