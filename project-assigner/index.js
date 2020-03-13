const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");
const _ = require('lodash');

async function handleLabeled(octokit, projectNumber, columnName, labelToMatch) {
    if (github.context.payload.label.name == labelToMatch) {
        const owner = github.context.payload.repository.owner.login;
        const repo = github.context.payload.repository.name;
        var contentId, contentType, state;
        if (github.context.eventName == "issues") {
            //contentId = github.context.payload.issue.id;
            contentId = github.context.payload.issue.node_id;
            state = github.context.payload.issue.state;
            contentType = 'Issue';
        } else if (github.context.eventName == "pull_request") {
            //contentId = github.context.payload.pull_request.id;
            contentId = github.context.payload.pull_request.node_id;
            state = github.context.payload.pull_request.state;
            contentType = 'PullRequest';
        } else {
            core.setFailed(`Unrecognized event: ${github.context.eventName}`);
        }

        console.log(`Creating a new card for ${state} ${contentType} [${contentId}] in project [${projectNumber}] column [${columnName}] matching label [${labelToMatch}], labeled by ${github.context.payload.sender.login}`);
        // try {
        //     const response = await octokit.projects.createCard({
        //         column_id: projectColumnId,
        //         content_id: contentId,
        //         content_type: contentType
        //     });
        //     console.log(`${contentType} #${contentId} added to project ${projectName} column ${projectColumnId}`);
        // } catch (error) {
        //     core.setFailed(`Error adding ${contentType} #${contentId} to project ${projectName} column ${projectColumnId}: ${error.message}`);
        // };
        try {
            const query = `{
                repository(name: ${repo}, owner: ${owner}) {
                    project(number: ${projectNumber}) {
                    columns(first: 50) {
                        nodes {
                        name,
                        id
                        }
                    }
                    }
                }
            }`;

            const response = await octokit(query);
            const columns = _.get(response, 'repository.project.columns.nodes');
            var targetColumnId;
            if (columns) {
                const targetColumn = _.find(columns, function(column) {
                    return (columnName == _.get(column, 'name'));
                });
                if (targetColumn) {
                    targetColumnId = _.get(targetColumn, 'id');
                }
            }
            
            if (targetColumnId) {
                var mutation = `mutation($targetColumnId: ID!, $contentId: ID!) {
                    addProjectCard(input: {
                        projectColumnId: $targetColumnId,
                        contentId: $contentId
                    }) {
                        cardEdge {
                        node {
                            id
                        }
                        }
                    }
                }`;

                await octokit(mutation, {targetColumnId, contentId});
            }
        } catch (error) {
            core.setFailed(`Error adding ${contentType} to project ${projectNumber} column ${columnName}: ${error.message}`);
        }
    }
}

async function handleUnlabeled(octokit, projectNumber, labelToMatch) {
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
                                        number
                                    },
                                    id
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
                                        number
                                    },
                                    id
                                }
                            }
                        }
                    }
                }
            }`;

            projectCardsPath = 'repository.pullRequest.projectCards.edges';
        }

        const response = await octokit(query);
        
        const projectCards = _.get(response, projectCardsPath);

        if (projectCards) {
            const cardToRemove = _.find(projectCards, function(card) {
                return (projectNumber == _.get(card, 'node.project.number')); 
            });

            if (cardToRemove) {
                const cardId = _.get(cardToRemove, 'node.id');

                try {
                    //const response = await octokit.projects.deleteCard({ card_id: cardId });
                    const mutation = `mutation($cardId: ID!) {
                        deleteProjectCard(input: {cardId: $cardId}) {
                            deletedCardId
                        }
                    }`;
                    await octokit(mutation, cardId);
                    console.log(`${contentType} removed from project ${projectNumber}`);
                } catch (error) {
                    core.setFailed(`Error removing ${contentType} from project: ${error.message}`);
                };
            } else {
                console.log(`No card found in project ${projectNumber} for a given ${contentType}`);
            }
        }
    }
}

async function run() {
    const ghToken = core.getInput('ghToken');
    const octokit = graphql.defaults({
        headers: {
          authorization: `Bearer ${ghToken}`
        }
    });

    try {
        const issueMappings = JSON.parse(core.getInput('issue-mappings'));

        if (github.context.payload.action == "labeled") {
            for (const mapping of issueMappings) {
                await handleLabeled(octokit, mapping.projectNumber, mapping.columnName, mapping.label);
            };
            
        } else if (github.context.payload.action == "unlabeled") {
            for (const mapping of issueMappings) {
                await handleUnlabeled(octokit, mapping.projectNumber, mapping.label);
            };
        }
    } catch (error) {
        context = JSON.stringify(github.context, undefined, 2);
        core.setFailed(`Action failed with error: ${error.message}\n Event context:\n\n${context}`);
    }
}

run();