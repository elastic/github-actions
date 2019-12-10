const core = require('@actions/core');
const github = require('@actions/github');
const _ = require('lodash');

async function handleLabeled(octokit, projectColumnId, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        var contentId, contentType;
        if (github.context.eventName == "issues") {
            contentId = github.context.payload.issue.id;
            contentType = 'Issue';
        } else if (github.context.eventName == "pull_request") {
            contentId = github.context.payload.pull_request.id;
            contentType = 'PullRequest';
        } else {
            core.setFailed(`Unrecognized event: ${github.context.eventName}`);
        }

        octokit.projects.createCard({
            column_id: projectColumnId,
            content_id: contentId,
            content_type: contentType
        }).then(function (response) {
            console.log(`${contentType} ${contentId} added to project`);
        }).catch(function(error) {
            core.setFailed(`Error adding ${contentType} to project: ${error.message}`);
        });
    }
}

async function handleUnlabeled(octokit, projectName, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        const owner = github.context.payload.repository.owner.login;
        const repo = github.context.payload.repository.name;
        var query, projectCardsPath;

        if (github.context.eventName == "issues") {
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
                octokit.projects.deleteCard({ card_id: cardId }).then(function(response) {
                    console.log(`Issue removed from project ${projectName}`);
                }).catch(function(error) {
                    core.setFailed(`Error removing issue from project: ${error.message}`);
                });
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
            issueMappings.forEach(mapping => {
                handleLabeled(octokit, mapping.columnId, mapping.label);
            });
            
        } else if (github.context.payload.action == "unlabeled") {
            issueMappings.forEach(mapping => {
                handleUnlabeled(octokit, mapping.projectName, mapping.label);
            });
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();