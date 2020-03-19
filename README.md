This repository contains various GitHub actions that the Elastic team has developed to help us automate some common processes.  Each action appears in it own folder.

To use these actions in your GitHub workfkflows, include them in the workflow configuration file step config.  For example:

	steps:
          - name: Assign to project
	    uses: elastic/github-actions/project-assigner@v2.0.0
	    id: project_assigner
	    with:
	      issue-mappings: '[{"label": "Test", "projectNumber": 1, "columnName": "To do"},
	        {"label": "bug", "projectNumber": 1, "columnName": "In progress"}]'
	      ghToken: ${{ secrets.GITHUB_TOKEN }}

