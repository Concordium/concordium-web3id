@Library('concordium-pipelines') _
pipeline {
    agent any
    stages {
        stage('dockerhub-login') {
            environment {
                // Defines 'CRED_USR' and 'CRED_PSW'
                // (see 'https://www.jenkins.io/doc/book/pipeline/jenkinsfile/#handling-credentials').
                CRED = credentials('jenkins-dockerhub')
            }
            steps {
                sh 'docker login --username "${CRED_USR}" --password "${CRED_PSW}"'
            }
        }
        stage('build') {
            environment {
                image_repo = "concordium/web3id-issuer"
                image_name = "${image_repo}:${image_tag}"
            }
            steps {
                sh '''\
                     docker build \
                        --build-arg build_image=rust:${rust_version}-buster\
                        --build-arg base_image=debian:buster\
                        --label rust_version="${rust_version}" \
                        -f services/web3id-issuer/scripts/build.Dockerfile\
                        -t "${image_name}"\
                        --no-cache\
                        .
                    docker push "${image_name}"
                '''.stripIndent()
            }
        }
    }
}
