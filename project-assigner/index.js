const core = require('@actions/core');
const github = require('@actions/github');
const _ = require('lodash');

async function handleLabeled(octokit, projectName, projectColumnId, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        var contentId, contentType, state;
        if (github.context.eventName == "issues") {
            contentId = github.context.payload.issue.id;
            state = github.context.payload.issue.state;
            contentType = 'Issue';
        } else if (github.context.eventName == "pull_request") {
            contentId = github.context.payload.pull_request.id;
            state = github.context.payload.pull_request.state;
            contentType = 'PullRequest';
        } else {
            core.setFailed(`Unrecognized event: ${github.context.eventName}`);
        }

        console.log(`Creating a new card for ${state} ${contentType} #${contentId} in project [${projectName}] column ${projectColumnId} mathing label [${labelToMatch}], labeled by ${github.context.payload.sender.login}`);
        try {
            const response = await octokit.projects.createCard({
                column_id: projectColumnId,
                content_id: contentId,
                content_type: contentType
            });
            console.log(`${contentType} #${contentId} added to project ${projectName} column ${projectColumnId}`);
        } catch (error) {
            core.setFailed(`Error adding ${contentType} #${contentId} to project ${projectName} column ${projectColumnId}: ${error.message}`);
        };
    }
}

async function handleUnlabeled(octokit, projectName, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        const owner = github.context.payload.repository.owner.login;
        const repo = github.context.payload.repository.name;
        var query, projectCardsPath, contentType;

        if (github.context.eventName == "issues") {
            contentType = 'Issue';
            query = `{
                repository(owner: "${owner}", name: "${repo}") {
                    issue(number: ${github.context.payload.issue.number}) {
                        projectCards {
                            edges {
                                node {
                                    project {
                                        name
                                    },
                                    databaseId
                                }
                            }
                        }
                    }
                }
            }`;

            projectCardsPath = 'repository.issue.projectCards.edges';

        } else if (github.context.eventName == "pull_request") {
            contentType = 'Pull request';
            query = `{
                repository(owner: "${owner}", name: "${repo}") {
                    pullRequest(number: ${github.context.payload.pull_request.number}) {
                        projectCards {
                            edges {
                                node {
                                    project {
                                        name
                                    },
                                    databaseId
                                }
                            }
                        }
                    }
                }
            }`;

            projectCardsPath = 'repository.pullRequest.projectCards.edges';
        }

        const response = await octokit.graphql(query);
        
        const projectCards = _.get(response, projectCardsPath);

        if (projectCards) {
            const cardToRemove = _.find(projectCards, function(card) {
                return (projectName == _.get(card, 'node.project.name')); 
            });

            if (cardToRemove) {
                const cardId = _.get(cardToRemove, 'node.databaseId');

                try {
                    const response = await octokit.projects.deleteCard({ card_id: cardId });
                    console.log(`${contentType} removed from project ${projectName}`);
                } catch (error) {
                    core.setFailed(`Error removing ${contentType} from project: ${error.message}`);
                };
            } else {
                console.log(`No card found in project ${projectName} for a given ${contentType}`);
            }
        }
    }
}

async function run() {
    const ghToken = core.getInput('ghToken');
    const octokit = new github.GitHub(ghToken);

    try {
        const issueMappings = JSON.parse(core.getInput('issue-mappings'));

        // console.log(`Event context: ${JSON.stringify(github.context, undefined, 2)}`);

        if (github.context.payload.action == "labeled") {
            for (const mapping of issueMappings) {
                await handleLabeled(octokit, mapping.projectName, mapping.columnId, mapping.label);
            };
            
        } else if (github.context.payload.action == "unlabeled") {
            for (const mapping of issueMappings) {
                await handleUnlabeled(octokit, mapping.projectName, mapping.label);
            };
        }
    } catch (error) {
        context = JSON.stringify(github.context, undefined, 2);
        core.setFailed(`Action failed with error: ${error.message}\n Event context:\n\n${context}`);
    }
}

run();