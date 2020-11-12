const fs = require('fs').promises;

const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Mapping from:
 *   plugin class names found in https://github.com/Yelp/detect-secrets/blob/master/detect_secrets/plugins/
 * to:
 *   class.secret_type
 */
const plugins = {
    ArtifactoryDetector: 'Artifactory Credentials',
    AWSKeyDetector: 'AWS Access Key',
    Base64HighEntropyString: 'Base64 High Entropy String',
    BasicAuthDetector: 'Basic Auth Credentials',
    CloudantDetector: 'Cloudant Credentials',
    HexHighEntropyString: 'Hex High Entropy String',
    IbmCloudIamDetector: 'IBM Cloud IAM Key',
    IbmCosHmacDetector: 'IBM COS HMAC Credentials',
    JwtTokenDetector: 'JSON Web Token',
    KeywordDetector: 'Secret Keyword',
    MailchimpDetector: 'Mailchimp Access Key',
    PrivateKeyDetector: 'Private Key',
    SlackDetector: 'Slack Token',
    SoftlayerDetector: 'SoftLayer Credentials',
    StripeDetector: 'Stripe Access Key',
    TwilioKeyDetector: 'Twilio API Key',
};

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

function convert(cwd, jsonInput) {

    const jsonOutput = {
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',

        runs: [
            {
                tool: {
                    driver: {
                        name: 'detect-secrets',
                        semanticVersion: jsonInput.version,
                        informationUri: 'https://github.com/Yelp/detect-secrets',
                        rules: []
                    }
                },

                invocations: [
                    {
                        executionSuccessful: true,
                        endTimeUtc: jsonInput.generated_at
                    }
                ],

                results: []
            }
        ]
    }

    // setting runs[0].tool.driver.rules
    jsonInput.plugins_used.forEach(function (plugin) {

        const rule = {
            id: plugin.name,
            helpUri: 'https://cwe.mitre.org/data/definitions/798.html',
            fullDescription: {
                text: 'Hard-coded secrets, such as passwords or keys, create a significant hole that allows an attacker with source code access to bypass authentication or authorization'
            },
            help: {
                text: 'Please use Harp (https://github.com/elastic/harp) to manage your secrets.',
                markdown: 'Please use [Harp](https://github.com/elastic/harp) to manage your secrets.'
            },
            properties: {
                tags: [
                    'CWE-798'
                ]
            }
        };

        if (plugins.hasOwnProperty(plugin.name)) {

            rule.name = `${plugin.name} detects hard-coded ${plugins[plugin.name]}`
            rule.shortDescription = {
                text: 'Hard-coded ' + plugins[plugin.name]
            };

            Object.keys(plugin).forEach(function (key) {
                if (key != 'name') {
                    rule.properties[key] = plugin[key];
                }
            });

            jsonOutput.runs[0].tool.driver.rules.push(rule);

        } else {
            console.log(`Warning: unknown detect-secrets plugin: ${plugin.name}`);
        }

    });

    // setting runs[0].results
    Object.keys(jsonInput.results).forEach(function (filePath) {

        jsonInput.results[filePath].forEach(function finding(f) {
            if (!f.is_verified) {

                const ruleId = getKeyByValue(plugins, f.type);

                if (plugins.hasOwnProperty(ruleId)) {
                    const ruleFinding = {
                        ruleId: ruleId,
                        level: 'error',
                        message: {
                            text: 'Hard-coded ' + plugins[ruleId]
                        },
                        locations: [
                            {
                                physicalLocation: {
                                    artifactLocation: {
                                        uri: `${cwd}/${filePath}`,
                                    },
                                    region: {
                                        startLine: f.line_number
                                    }
                                }
                            }
                        ],
                    }
                    jsonOutput.runs[0].results.push(ruleFinding);
                }
            }

        });

    });

    return jsonOutput;
}

function readBaselineFileFromRepo(path) {
    const octokit = github.getOctokit(process.env.MGH_TOKEN);
    const repo = process.env.GITHUB_REPOSITORY.split("/");

    octokit.repos.getContent({
        owner: repo[0],
        repo: repo[1],
        path: path
    }).then(result => {
        return Buffer.from(result.data.content, 'base64').toString();
    }).catch(err => {
        console.log(err);
        return core.setFailed(err.message);
    });
}

const baselineFileLocation = core.getInput('baseline-file-location');
const baselineFilePath = core.getInput('baseline-file-path');

let detect_secrets_file_content;
if (baselineFileLocation == 'local') {

    fs.readFile(baselineFileLocation).then((content) => {
        detect_secrets_file_content = content;
    }).catch(err => {
        console.log(err);
        return core.setFailed(err.message);
    });

} else {
    detect_secrets_file_content = readBaselineFileFromRepo(baselineFilePath);
}

const sarifContent = JSON.stringify(
    convert(
        core.getInput('scan-dir'),
        JSON.parse(detect_secrets_file_content)
    ),
    null,
    2);

console.log(sarifContent);

const sarifFilePath = `${process.env.RUNNER_TEMP}/${Date.now()}_sarif.json`;

fs.writeFile(sarifFilePath, sarifContent).then(() => {
    console.log(`Sarif saved to ${sarifFilePath}`);
    core.setOutput('sarif-file-path', sarifFilePath);
}).catch(err => {
    console.log(err);
    core.setFailed(err.message);
});
