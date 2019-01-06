workflow "build, test and publish on release" {
  on = "push"
  resolves = "publish"
}

# install with yarn
action "install" {
  uses = "actions/npm@1.0.0"
  runs = "yarn"
  args = "install"
  env = {
    GITHUB_WORKSPACE  = "/github/workspace/ts-loader"
  }
}

# build with yarn
action "build" {
  needs = "install"
  uses = "actions/npm@1.0.0"
  runs = "yarn"
  args = "build"
  env = {
    GITHUB_WORKSPACE  = "/github/workspace/ts-loader"
  }
}

# test with yarn - commented until they work in docker
action "test" {
  needs = "build"
  uses = "./.github/node-chrome"
  runs = "yarn"
  args = "execution-tests"
  env = {
    GITHUB_WORKSPACE  = "/github/workspace/ts-loader"
  }
}

# filter for a new tag
action "check for new tag" {
  needs = "test"
  uses = "actions/bin/filter@master"
  args = "tag"
  env = {
    GITHUB_WORKSPACE  = "/github/workspace/ts-loader"
  }
}

# publish with npm
action "publish" {
  needs = "check for new tag"
  uses = "actions/npm@1.0.0"
  args = "publish"
  secrets = ["NPM_AUTH_TOKEN"]
  env = {
    GITHUB_WORKSPACE  = "/github/workspace/ts-loader"
  }
}
