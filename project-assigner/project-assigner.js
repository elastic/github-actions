const core = require('@actions/core');
const github = require('@actions/github');
const { graphql } = require("@octokit/graphql");
const _ = require('lodash');

class ProjectAssigner {
    // Label added to an issue or PR. Add a project card for the item into the desired column.
    async handleLabeled(octokit, projectNumber, columnName, labelToMatch, projectScope, context) {
        if (context.labelName == labelToMatch) {
            const { itemType, itemNumber, itemNodeId } = context;

            if (!projectNumber) {
                throw new Error(`projectNumber is required.`);
            }
            if (!columnName) {
                throw new Error(`columnName is required.`);
            }
            if (!projectScope) {
                throw new Error(`projectScope is required.`);
            }

            const existingCardId = await this.findProjectCardId(octokit, projectNumber, context);
            if (existingCardId) {
                console.log(`Card already exists in ${projectScope} project ${projectNumber}`);
                return;
            }

            const targetColumnId = await this.findColumnIdForColumnName(octokit, projectScope, projectNumber, columnName, context);
            if (!targetColumnId) {
                throw new Error(`Error adding ${itemType} to ${projectScope} project ${projectNumber}: column "${columnName}" was not found`);
            }

            console.log(`Creating a new card for ${itemType} number ${itemNumber}, node ID ${itemNodeId} in ${projectScope} project [${projectNumber}] column ID [${targetColumnId}] matching label [${labelToMatch}], labeled by ${context.owner} of repo ${context.repo}`);
            await this.createCard(octokit, targetColumnId, itemNodeId);
        }
    }

    async findProjectCardId(octokit, projectNumber, context) {
        const { itemQuery, projectCardsPath, itemType, itemNumber } = context;
        try {
            const query = `{
                ${this.scopedProjectQuery("repo", context)} {
                    ${itemQuery} {
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

            console.log(`Query for project cards:\n${query}`);
            const response = await octokit(query);
            const projectCards = _.get(response, projectCardsPath);
            let cardId = null;
            if (projectCards) {
                const matchingCard = _.find(projectCards, function(card) {
                    return (projectNumber == _.get(card, 'node.project.number'));
                });

                if (matchingCard) {
                    cardId = _.get(matchingCard, 'node.id');
                }
            }
            return cardId;
        } catch (error) {
            throw new Error(`Error querying project card for ${itemType} number ${itemNumber}: ${error.message}`);
        }
    }

    async findColumnIdForColumnName(octokit, projectScope, projectNumber, columnName, context) {
        try {
            const query = `{
                ${this.scopedProjectQuery(projectScope, context)} {
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

            console.log(`Query for project columns:\n ${query}`)
            const response = await octokit(query);
            const columns = _.get(response, this.scopedProjectColumnsPath(projectScope));
            if (columns) {
                const targetColumn = _.find(columns, function(column) {
                    return (columnName == _.get(column, 'name'));
                });
                if (targetColumn) {
                    return _.get(targetColumn, 'id');
                }
            }
            return null;
        } catch (error) {
            throw new Error(`Error finding column ID for column name ${columnName}: ${error.message}`);
        }
    }

    async createCard(octokit, projectColumnId, contentId) {
        try {
            const mutation = `
                mutation {
                    addProjectCard(input: { projectColumnId: "${projectColumnId}", contentId: "${contentId}" }) {
                        cardEdge {
                            node {
                                id
                            }
                        }
                    }
                }`;
            console.log(`Create card mutation: ${mutation}`);
            const response = await octokit(mutation); // Octokit will throw an error if GraphQL returns any error messages
            console.log(`Create card response:\n${JSON.stringify(response)}`);
        } catch (error) {
            throw new Error(`Error creating card with content ID [${contentId}] in project column [${projectColumnId}]: ${error.message}`);
        }
    }

    // GraphQL query segment to allow searching for projects belonging to an organization, user, or repository.
    scopedProjectQuery(projectScope, context) {
        switch(projectScope) {
            case 'org':
                return `organization(login: "${context.owner}")`;
            case 'user':
                return `user(login: "${context.owner}")`;
            case 'repo':
                return `repository(owner: "${context.owner}", name: "${context.repo}")`;
            default:
                throw new Error(`Invalid projectScope ${projectScope}. Expected: org, user, or repo`);
        }
    }

    // For extracting columns data from a project columns GraphQL query
    scopedProjectColumnsPath(projectScope) {
        switch(projectScope) {
            case 'org':
                return 'organization.project.columns.nodes';
            case 'user':
                return 'user.project.columns.nodes';
            case 'repo':
                return 'repository.project.columns.nodes';
            default:
                throw new Error(`Invalid projectScope ${projectScope}. Expected: org, user, or repo`);
        }
    }

    // Label removed; Find any associated project card and delete it.
    async handleUnlabeled(octokit, projectNumber, labelToMatch, context) {
        if (context.labelName == labelToMatch) {
            const { itemType, itemNumber } = context;

            if (!projectNumber) {
                throw new Error(`projectNumber is required.`);
            }

            const projectCards = await this.findProjectCardsForPayloadItem(octokit, context);
            if (!projectCards) {
                console.log(`No project cards found for ${itemType} number ${itemNumber}`);
                return;
            }

            const cardToRemove = _.find(projectCards, function(card) {
                return (projectNumber == _.get(card, 'node.project.number'));
            });
            if (!cardToRemove) {
                console.log(`No card found in project ${projectNumber} for the given ${itemType}`);
                return;
            }

            const cardId = _.get(cardToRemove, 'node.id');
            console.log(`Removing card [${cardId}] for ${itemType} number ${itemNumber} from project ${projectNumber}`);
            await this.removeCard(octokit, cardId);
        }
    }

    async findProjectCardsForPayloadItem(octokit, context) {
        const { owner, repo, projectCardsPath, itemQuery, itemType, itemNumber } = context;
        try {
            const query = `{
                repository(owner: "${owner}", name: "${repo}") {
                    ${itemQuery} {
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
            console.log(`Query for project cards:\n${query}`);
            const response = await octokit(query); // Octokit will throw an error if GraphQL returns any error messages
            console.log(`Response to query for project cards:\n${JSON.stringify(response)}`);
            return _.get(response, projectCardsPath);
        } catch (error) {
            throw new Error(`Error finding project cards for ${itemType} number ${itemNumber}: ${error.message}`);
        }
    }

    async removeCard(octokit, cardId) {
        try {
            const mutation = `mutation {
                deleteProjectCard(input: {cardId: "${cardId}"}) {
                    deletedCardId
                }
            }`;
            console.log(`Remove card mutation:\n${mutation}`);
            const response = await octokit(mutation); // Octokit will throw an error if GraphQL returns any error messages
            console.log(`Remove card response:\n${JSON.stringify(response)}`);
        } catch (error) {
            throw new Error(`Error removing card ${cardId}`);
        }
    }

    normalizedGithubContext(githubContext) {
        const context = {
            owner: githubContext.payload.repository.owner.login,
            repo: githubContext.payload.repository.name,
            labelName: githubContext.payload.label.name,
        }
        if (githubContext.eventName == "issues") {
            context['itemType'] = 'Issue';
            context['itemNumber'] = githubContext.payload.issue.number;
            context['itemNodeId'] = githubContext.payload.issue.node_id;
            context['itemQuery'] = `issue(number: ${githubContext.payload.issue.number})`;
            context['projectCardsPath'] = 'repository.issue.projectCards.edges';
        } else if (githubContext.eventName == "pull_request") {
            context['itemType'] = 'Pull request';
            context['itemNumber'] = githubContext.payload.pull_request.number;
            context['itemNodeId'] = githubContext.payload.pull_request.node_id;
            context['itemQuery'] = `pullRequest(number: ${githubContext.payload.pull_request.number})`;
            context['projectCardsPath'] = 'repository.pullRequest.projectCards.edges';
        }
        return context;
    }

    async run() {
        const ghToken = core.getInput('ghToken');
        const octokit = graphql.defaults({
            headers: {
            authorization: `Bearer ${ghToken}`
            }
        });

        try {
            const issueMappings = JSON.parse(core.getInput('issue-mappings'));
            const context = this.normalizedGithubContext(github.context);

            if (github.context.payload.action == "labeled") {
                for (const mapping of issueMappings) {
                    await this.handleLabeled(octokit, mapping.projectNumber, mapping.columnName, mapping.label, mapping.projectScope || "repo", context);
                };

            } else if (github.context.payload.action == "unlabeled") {
                for (const mapping of issueMappings) {
                    await this.handleUnlabeled(octokit, mapping.projectNumber, mapping.label, context);
                };
            }
        } catch (error) {
            const ghContext = JSON.stringify(github.context, undefined, 2);
            core.setFailed(`Action failed with error: ${error.message}\n Event context:\n\n${ghContext}`);
        }
    }
}

module.exports = ProjectAssigner;
