const core = require('@actions/core');
const github = require('@actions/github');

try {
  const baselineFilePath = core.getInput('baseline-file-path');
  console.log(`Hello ${baselineFilePath}`);

  const octokit = github.getOctokit(process.env.MGH_TOKEN);
  const repo = process.env.GITHUB_REPOSITORY.split("/");
  octokit.codeScanning.uploadSarif({
    owner: repo[0],
    repo: repo[1],
    commit_sha: process.env.GITHUB_SHA,
    ref: process.env.GITHUB_REF,
    sarif: "H4sICCGWoF8AA2RzLnNhcmlmLmpzb24AjVRNb9swDL37VwjGjrHdfWCHHrsOWIHeug4YhqBQZNrWIEuGKKUxgvz3UXKcxnGaJQfHpGjyPZJP24SxdA0WpdHpLUs/5R/zm3QRvB9QNNDy4G2c6/C2KCx/zWvpGr/yCFYY7UC7XJi2MBwlZk5ggdzKKsMORNFydGCLp5jH8fEomlmslP9FqhvLWa+Rav2hd8a28UleZ4wi72iTp7SS8E585NW8hYC0BAfCZQjCgsOY+RAjdWUsASGqz1Ye8xo4RSK/QXXFpSzWK3gDOv62EysUK0OBO47w9csPWTfftbOm65+clbqeZIzh2Bjr7gGFlZ0bZnGaMnQDNi6k/Xl3n56c7mYpK6/U1RmfNU20ZGuaEF8RwQWTbUeQ6KXyWoQEyIxlQnFEQNbynq2AcYZ92znTMlORsfI147pkxMarMgTAhrdSU2bBLQREff5/5A3N4GRCgErSqhlbF6WhLYtTKLTJfASeEXCcd7WjloN1Mg7sDHvBHdTG9qHSr5H6DF/ynrVMTr0HLimnshUXbroqk51VRvCzk0n9QL6SCoh78e2WNnI9yGcvIuedIbwq6K3tQi8ewoKVPo6qQBmcWeg+/ZPKjkntZrCXB9gW0KuLoGENQZEpWGvsVBotIPIa5nzGLRvkwIIe2F4QbK+IY3yLc126QnNd06MUXD2+19gYNU7mYtR0CFiE58srXRMv+0sh7/rZvsXPpC5hQx/ezA5nix77XV+AgI7APpJ+KODzPN/1izq7wR6uvp6G8Bmpw+oko7VMdsk/NdBMvk8GAAA=",
    tool_name: "detect-secrets"
  });

} catch (error) {
  core.setFailed(error.message);
}
