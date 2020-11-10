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

function convert(jsonInput) {

    const jsonOutput = {
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',

        runs: [
            {
                tool: {
                    driver: {
                        name: 'detect-secrets',
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

    jsonInput.plugins_used.forEach(function (plugin) {
        const rule = {id: plugin.name};
        if (plugins.hasOwnProperty(plugin.name)) {
            rule.shortDescription = {
                text: 'Hard-coded ' + plugins[plugin.name]
            };
            rule.fullDescription = {
                text: 'Hard-coded secrets, such as passwords or keys, create a significant hole that allows an attacker with source code access to bypass authentication or authorization'
            };
            rule.helpUri = 'https://cwe.mitre.org/data/definitions/798.html'
        }
        Object.keys(plugin).forEach(function (key) {
            if (key != 'name') {
                if (!rule.hasOwnProperty('properties')) {
                    rule.properties = {};
                }
                rule.properties[key] = plugin[key];
            }
        });
        jsonOutput.runs[0].tool.driver.rules.push(rule);
    });

    Object.keys(jsonInput.results).forEach(function (filePath) {

        jsonInput.results[filePath].forEach(function finding(f) {
            if (!f.is_verified) {

                const ruleId = getKeyByValue(plugins, f.type);

                const existingRuleFinding = {
                    ruleId: ruleId,
                    level: 'error',
                    message: {
                        text: 'Hard-coded ' + plugins[ruleId]
                    },
                    locations: [
                        {
                            physicalLocation: {
                                artifactLocation: {
                                    uri: filePath,
                                },
                                region: {
                                    startLine: f.line_number
                                }
                            }
                        }
                    ],
                }
                jsonOutput.runs[0].results.push(existingRuleFinding);
            }

        });

    });

    return jsonOutput;
}

const baselineFilePath = core.getInput('baseline-file-path');
const sarifFilePath = core.getInput('sarif-file-path');

const octokit = github.getOctokit(process.env.MGH_TOKEN);
const repo = process.env.GITHUB_REPOSITORY.split("/");

octokit.repos.getContent({
    owner: repo[0],
    repo: repo[1],
    path: baselineFilePath
}).then(result => {

    const detect_secrets_file_content = Buffer.from(result.data.content, 'base64').toString()

    const sarif = convert(JSON.parse(detect_secrets_file_content));

    octokit.repos.createOrUpdateFileContents({
        owner: repo[0],
        repo: repo[1],
        path: sarifFilePath,
        message: "converted from " + baselineFilePath,
        content: Buffer.from(JSON.stringify(sarif, null, 2)).toString('base64')
    }, function (err, res) {
        console.log(err, res);
        core.setFailed(err.message);
    });

}).catch(err => {
    console.log(err);
    core.setFailed(err.message);
});
